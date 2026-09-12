//! Structural gate on the read-only role.
//!
//! A `platform_viewer` may read everything an admin can and change nothing.
//! That is enforced once, in `auth::authenticate`, by refusing any method
//! outside GET/HEAD/OPTIONS before a handler runs — which works only while
//! every mutating route lives under a router that middleware actually wraps.
//!
//! Nothing in the type system says so. A new router merged into `admin_api`
//! after the `route_layer` call, or composed into a different tree, compiles
//! and serves, and every POST on it is a write a viewer can perform. The
//! failure is silent: the viewer sees success, the audit log names them, and
//! nobody finds out until someone reads the wiring.
//!
//! So the invariant is asserted here rather than documented, in the same
//! shape as `route_authority.rs`: read the sources as text, because
//! `axum::Router` has no route introspection and an assertion that can only
//! be satisfied by editing the wiring is worth more than one that can only be
//! satisfied by editing itself.

const MAIN: &str = include_str!("../src/main.rs");
const AUTH: &str = include_str!("../src/auth.rs");
const ERROR: &str = include_str!("../src/error.rs");

/// The middleware must reject on the method, not on a per-route opinion.
///
/// A denylist of mutating verbs would silently admit anything it forgot;
/// PATCH was absent from an earlier draft of exactly this kind of check
/// elsewhere. An allowlist fails closed: a verb nobody listed is refused.
#[test]
fn read_only_identities_are_refused_by_method_allowlist() {
    let block = AUTH
        .split("pub async fn authenticate")
        .nth(1)
        .expect("authenticate middleware must exist");
    let guard = block
        .split("next.run")
        .next()
        .expect("middleware body must precede the inner call");

    assert!(
        guard.contains("is_read_only()"),
        "authenticate must consult is_read_only before running the handler"
    );
    for allowed in ["Method::GET", "Method::HEAD", "Method::OPTIONS"] {
        assert!(
            guard.contains(allowed),
            "the read-only guard must name {allowed} in its allowlist"
        );
    }
    // An allowlist, not a denylist: no mutating verb should be enumerated.
    for denied in [
        "Method::POST",
        "Method::PUT",
        "Method::PATCH",
        "Method::DELETE",
    ] {
        assert!(
            !guard.contains(denied),
            "{denied} appears in the guard — that reads as a denylist, which \
             admits whichever verb the next author forgets"
        );
    }
}

/// The refusal has to be a 403, not a 401 or a 500.
///
/// 401 would tell a correctly authenticated viewer to log in again, and a
/// client that retries on 401 would loop. The distinction is the whole
/// difference between "who are you" and "not you".
#[test]
fn the_refusal_maps_to_403() {
    let block = AUTH
        .split("pub async fn authenticate")
        .nth(1)
        .expect("authenticate middleware must exist");
    let guard = block.split("next.run").next().unwrap_or(block);
    assert!(
        guard.contains("ApiError::Forbidden"),
        "the read-only refusal must be Forbidden"
    );
    assert!(
        ERROR.contains("Self::Forbidden(_) => (StatusCode::FORBIDDEN"),
        "ApiError::Forbidden must map to HTTP 403"
    );
}

/// Every operator router has to sit under `authenticate`.
///
/// `route_layer` applies to the routes present when it is called, so the call
/// must come after the merges. A router merged in afterwards is unguarded,
/// and that is invisible at the call site — the code still reads as one
/// chained expression.
#[test]
fn every_operator_router_is_merged_before_the_guard_is_applied() {
    let assembly = MAIN
        .split("let admin_api = ")
        .nth(1)
        .expect("admin_api must be assembled in main.rs");
    let statement = assembly
        .split_once(";\n")
        .map_or(assembly, |(head, _)| head);

    let guard_at = statement
        .find("auth::authenticate")
        .expect("admin_api must apply the authenticate middleware");
    let last_merge_at = statement
        .rfind(".merge(")
        .expect("admin_api must merge at least one router");

    assert!(
        last_merge_at < guard_at,
        "a router is merged into admin_api after `authenticate` is applied, so \
         its routes never reach the read-only guard and a platform_viewer can \
         write through them"
    );
}

/// Only routers with their own machine credential may sit outside the guard.
///
/// A `platform_viewer` cannot obtain a telemetry, provisioner or automation
/// bearer, so those surfaces are unreachable rather than unguarded. Any
/// *other* top-level router carrying writes would be a hole, so the exemption
/// list is written down and checked instead of assumed.
#[test]
fn routers_outside_the_guard_all_carry_their_own_credential() {
    for (router, guard) in [
        ("telemetry_api", "auth::require_telemetry"),
        ("provisioner_api", "auth::require_provisioner"),
        ("automation_api", "auth::require_automation"),
    ] {
        let assembly = MAIN
            .split(&format!("let {router} = "))
            .nth(1)
            .unwrap_or_else(|| panic!("{router} must be assembled in main.rs"));
        let statement = assembly
            .split_once(";\n")
            .map_or(assembly, |(head, _)| head);
        assert!(
            statement.contains(guard),
            "{router} sits outside `authenticate`, so it must be gated by \
             {guard} — a viewer session must not be able to reach it"
        );
    }
}

/// `is_read_only` must key on the role, and only the read-only one.
///
/// Written as a text check because the identity carries a borrowed `&'static
/// str` role rather than an enum: a typo in the literal compiles and silently
/// grants write access to every viewer.
#[test]
fn only_the_platform_viewer_role_is_read_only() {
    let block = AUTH
        .split("pub fn is_read_only")
        .nth(1)
        .expect("is_read_only must exist");
    let body = block.split("\n    }").next().unwrap_or(block);
    assert!(
        body.contains("\"platform_viewer\""),
        "is_read_only must match the platform_viewer role literal"
    );
    assert!(
        !body.contains("\"platform_admin\""),
        "platform_admin must not be treated as read-only"
    );
}
