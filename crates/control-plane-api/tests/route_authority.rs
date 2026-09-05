//! Structural gate on the tenant boundary.
//!
//! Tenant scope is enforced once, path-wide, by `auth::require_tenant_access`
//! wrapped around whole routers in `main.rs`. That works only while every
//! `/tenants/{slug}/…` route lives in a router that is actually wrapped.
//! Nothing in the type system says so: a new route added to an unwrapped
//! router compiles, serves, and is a cross-tenant read until a human notices.
//!
//! So the invariant is asserted here instead of documented. Every router
//! function that declares a `/tenants/{slug}` route must either be composed
//! through `scoped(...)` in `main.rs`, or be one of the machine-authority
//! routers that are named below with the reason they are exempt.
//!
//! This reads the sources as text on purpose. `axum::Router` has no route
//! introspection, and an assertion that can only be satisfied by editing the
//! wiring is worth more than one that can only be satisfied by editing itself.

use std::collections::{BTreeMap, BTreeSet};

const MAIN: &str = include_str!("../src/main.rs");

/// Routers whose tenant scope is deliberately not `require_tenant_access`.
///
/// Both are machine authorities: they are reached with a dedicated bearer, not
/// a browser session, and there is no operator identity to scope against. The
/// bearer itself is the whole authority, and it is checked by its own
/// middleware in `main.rs`.
const MACHINE_AUTHORITY_ROUTERS: &[(&str, &str)] = &[
    (
        "telemetry_router",
        "runtime reports arrive with the telemetry bearer; require_telemetry is its guard",
    ),
    (
        "provisioner_router",
        "provisioner jobs are claimed with the provisioner bearer and keyed by claim token",
    ),
];

/// Every source file that can declare routes.
fn sources() -> Vec<(&'static str, &'static str)> {
    vec![
        ("routes.rs", include_str!("../src/routes.rs")),
        ("area_routes.rs", include_str!("../src/area_routes.rs")),
        (
            "attention_routes.rs",
            include_str!("../src/attention_routes.rs"),
        ),
        (
            "operations_routes.rs",
            include_str!("../src/operations_routes.rs"),
        ),
        ("agent_routes.rs", include_str!("../src/agent_routes.rs")),
        ("read_models.rs", include_str!("../src/read_models.rs")),
        ("notify_routes.rs", include_str!("../src/notify_routes.rs")),
        (
            "runtime_routes.rs",
            include_str!("../src/runtime_routes.rs"),
        ),
        (
            "automation_routes.rs",
            include_str!("../src/automation_routes.rs"),
        ),
        ("auth_routes.rs", include_str!("../src/auth_routes.rs")),
    ]
}

/// Map every router function to the route literals it declares.
///
/// A router function runs from its `fn name(` header to the next one, which is
/// all the structure needed: routes are declared inside the function that
/// returns them.
fn routes_by_router(source: &str) -> BTreeMap<String, Vec<String>> {
    // Function headers, by byte offset, so a `.route(` can be attributed to
    // whichever function it falls inside regardless of how rustfmt wrapped it.
    let mut headers: Vec<(usize, String)> = Vec::new();
    let mut offset = 0usize;
    for line in source.lines() {
        let indent = line.len() - line.trim_start().len();
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed
            .strip_prefix("pub fn ")
            .or_else(|| trimmed.strip_prefix("pub(crate) fn "))
            .or_else(|| trimmed.strip_prefix("fn "))
        {
            if let Some(name) = rest.split('(').next() {
                headers.push((offset + indent, name.to_owned()));
            }
        }
        offset += line.len() + 1;
    }

    let mut found: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (index, _) in source.match_indices(".route(") {
        let after = &source[index + ".route(".len()..];
        // rustfmt may put the path on the next line; the first thing after
        // the paren is either the literal or whitespace before it.
        let Some(quote) = after.find('"') else {
            continue;
        };
        if after[..quote].chars().any(|c| !c.is_whitespace()) {
            continue;
        }
        let Some(path) = after[quote + 1..].split('"').next() else {
            continue;
        };
        let Some((_, owner)) = headers.iter().rev().find(|(at, _)| *at <= index) else {
            continue;
        };
        found
            .entry(owner.clone())
            .or_default()
            .push(path.to_owned());
    }
    found
}

/// The `main.rs` statement a router function is composed in.
///
/// Statements are `;`-terminated and the wiring never nests one inside
/// another, so the text from the previous terminator to the next one is
/// exactly the composition — router, `scoped(...)`, and any `route_layer`.
/// The router is addressed module-qualified because several modules export a
/// function called `router`.
fn composition_statement(module: &str, router: &str) -> Option<&'static str> {
    let call = format!("{module}::{router}()");
    let at = MAIN.find(&call)?;
    let start = MAIN[..at].rfind([';', '{']).map_or(0, |index| index + 1);
    let end = at + MAIN[at..].find(';')?;
    Some(&MAIN[start..end])
}

/// Is this router composed behind the tenant guard — through the shared
/// `scoped(...)` wrapper, or by applying `require_tenant_access` directly?
fn is_tenant_guarded(module: &str, router: &str) -> bool {
    let Some(statement) = composition_statement(module, router) else {
        return false;
    };
    statement.contains("auth::require_tenant_access")
        || statement.contains(&format!("scoped({module}::{router}()"))
}

#[test]
fn every_tenant_scoped_router_is_wrapped_in_require_tenant_access() {
    let exempt: BTreeSet<&str> = MACHINE_AUTHORITY_ROUTERS
        .iter()
        .map(|(name, _)| *name)
        .collect();

    let mut unguarded = Vec::new();
    let mut checked = 0usize;
    for (file, source) in sources() {
        let module = file.trim_end_matches(".rs");
        for (router, paths) in routes_by_router(source) {
            let tenant_paths: Vec<&String> = paths
                .iter()
                .filter(|path| path.starts_with("/tenants/{slug}"))
                .collect();
            if tenant_paths.is_empty() {
                continue;
            }
            checked += 1;
            if is_tenant_guarded(module, &router) || exempt.contains(router.as_str()) {
                continue;
            }
            unguarded.push(format!("{module}::{router} declares {tenant_paths:?}"));
        }
    }
    // A parser that silently stops finding routes would pass this test while
    // proving nothing.
    assert!(
        checked >= 8,
        "expected the route scan to find the known tenant-scoped routers, found {checked}"
    );

    assert!(
        unguarded.is_empty(),
        "these routers declare /tenants/{{slug}} routes but are not wrapped in \
         require_tenant_access in main.rs, so a caller's tenant is never checked \
         against the path:\n  {}",
        unguarded.join("\n  ")
    );
}

#[test]
fn the_scoped_wrapper_is_still_require_tenant_access() {
    // The test above is only worth its assertion while `scoped` is the thing
    // it claims to be. If the closure is ever repointed at another middleware,
    // this fails instead of quietly certifying nothing.
    let closure = MAIN
        .split_once("let scoped =")
        .expect("main.rs defines a `scoped` router wrapper")
        .1;
    let body = &closure[..closure
        .find("};")
        .expect("the scoped closure is terminated")];
    assert!(
        body.contains("auth::require_tenant_access"),
        "`scoped` must apply require_tenant_access; it currently applies:\n{body}"
    );
}

#[test]
fn machine_authority_routers_keep_their_own_middleware() {
    // The exemptions above are only safe while the bearer guards are actually
    // attached. Name each one next to its router in main.rs.
    for (router, guard) in [
        ("telemetry_router", "auth::require_telemetry"),
        ("provisioner_router", "auth::require_provisioner"),
        ("ingestion_router", "auth::require_automation"),
    ] {
        let wiring = MAIN
            .split_once(&format!("{router}()"))
            .unwrap_or_else(|| panic!("main.rs composes {router}"))
            .1;
        // The guard is attached in the same statement, which ends at the
        // first `;` after the router call.
        let statement = &wiring[..wiring.find(';').expect("statement is terminated")];
        assert!(
            statement.contains(guard),
            "{router} must be wrapped in {guard}; it is wired as:\n{statement}"
        );
    }
}

#[test]
fn the_operator_surface_is_authenticated_as_one_router() {
    // Everything an operator can reach is merged into `admin_api` and gets
    // `auth::authenticate` once. A router merged into the top-level `api`
    // instead would be unauthenticated.
    let admin_api = MAIN
        .split_once("let admin_api =")
        .expect("main.rs builds admin_api")
        .1;
    let statement = &admin_api[..admin_api.find(';').expect("statement is terminated")];
    assert!(
        statement.contains("auth::authenticate"),
        "admin_api must carry auth::authenticate:\n{statement}"
    );

    // Only these five routers may be merged directly into the public `api`,
    // and each is either public by design or carries a machine-authority
    // guard of its own.
    let api = MAIN
        .split_once("let api = Router::new()")
        .expect("main.rs builds the api router")
        .1;
    let statement = &api[..api.find(';').expect("statement is terminated")];
    let merged: Vec<&str> = statement
        .match_indices(".merge(")
        .map(|(index, _)| {
            let rest = &statement[index + ".merge(".len()..];
            rest.split(')').next().unwrap_or("").trim()
        })
        .collect();
    assert_eq!(
        merged,
        vec![
            "auth_api",
            "admin_api",
            "telemetry_api",
            "provisioner_api",
            "automation_api"
        ],
        "a router merged into `api` bypasses auth::authenticate unless it \
         carries its own machine-authority guard"
    );
}
