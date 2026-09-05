//! Structural gate on configuration drift.
//!
//! Three copies of the environment contract have to agree: what `config.rs`
//! reads, what `.env.example` documents, and what each deployment manifest
//! forwards into the container. Nothing enforced that, and the failure mode is
//! silent by construction — a variable that is set on the host but not passed
//! through simply has no effect, and one colour of a blue/green pair can run
//! on built-in defaults while the other runs on the configured values.
//!
//! Each exemption below is named with the reason it is one.

use std::collections::BTreeSet;

const CONFIG: &str = include_str!("../src/config.rs");
const ENV_EXAMPLE: &str = include_str!("../../../.env.example");
const PRODUCTION: &str = include_str!("../../../deploy/compose.production.yml");
const BLUEGREEN: &str = include_str!("../../../deploy/compose.bluegreen.yml");

/// Deliberately never forwarded from the host environment.
const NOT_FORWARDED: &[(&str, &str)] = &[(
    "CONTROL_PLANE_COOKIE_SECURE",
    "defaults to true; the only value it can take is a downgrade, so a \
     production container must not be able to inherit it from the host env",
)];

/// Container image selectors, not API configuration.
const IMAGE_TAG_VARIABLES: &[&str] = &[
    "CONTROL_PLANE_IMAGE_TAG",
    "CONTROL_PLANE_BLUE_TAG",
    "CONTROL_PLANE_GREEN_TAG",
];

fn variables(source: &str) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    let bytes = source.as_bytes();
    for (index, _) in source.match_indices("CONTROL_PLANE_") {
        let end = source[index..]
            .find(|c: char| !(c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_'))
            .map_or(source.len(), |offset| index + offset);
        // Skip a match that is part of a longer identifier (a Rust type or a
        // lowercase-suffixed name).
        if end < bytes.len() && (bytes[end] as char).is_ascii_lowercase() {
            continue;
        }
        found.insert(source[index..end].to_owned());
    }
    found
}

/// The variables `config.rs` actually reads from the environment.
///
/// rustfmt wraps a long reader call so the name lands on the next line, so the
/// scan skips whitespace to the literal rather than requiring the quote to sit
/// against the paren. Getting that wrong silently shrinks the set this gate
/// checks, which is why `read_by_config` asserts its own yield below.
fn read_by_config() -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    for marker in [
        "env::var(",
        "optional_env(",
        "optional_secret(",
        "required_secret(",
    ] {
        let mut rest = CONFIG;
        while let Some(index) = rest.find(marker) {
            rest = &rest[index + marker.len()..];
            let Some(quote) = rest.find('"') else {
                continue;
            };
            if rest[..quote].chars().any(|c| !c.is_whitespace()) {
                continue;
            }
            if let Some(name) = rest[quote + 1..].split('"').next() {
                if name.starts_with("CONTROL_PLANE_") {
                    found.insert(name.to_owned());
                }
            }
        }
    }
    assert!(
        found.len() > 20,
        "the config scan found only {} variables; the parser is broken, not the config",
        found.len()
    );
    found
}

#[test]
fn every_variable_the_api_reads_is_documented() {
    let documented = variables(ENV_EXAMPLE);
    let read = read_by_config();
    let undocumented: Vec<&String> = read
        .iter()
        .filter(|name| !documented.contains(*name))
        .collect();
    assert!(
        undocumented.is_empty(),
        ".env.example must document every variable config.rs reads; missing: {undocumented:?}"
    );
}

#[test]
fn both_deployment_manifests_forward_every_variable_the_api_reads() {
    let exempt: BTreeSet<&str> = NOT_FORWARDED.iter().map(|(name, _)| *name).collect();
    let read = read_by_config();
    for (label, manifest) in [("production", PRODUCTION), ("bluegreen", BLUEGREEN)] {
        let forwarded = variables(manifest);
        let missing: Vec<&String> = read
            .iter()
            .filter(|name| !forwarded.contains(*name) && !exempt.contains(name.as_str()))
            .collect();
        assert!(
            missing.is_empty(),
            "deploy/compose.{label}.yml does not forward: {missing:?} — \
             setting them on the host would have no effect"
        );
    }
}

#[test]
fn the_two_colours_are_configured_identically() {
    // A blue/green cutover must not change configuration. It did: the green
    // manifest was missing the provisioner image and lease variables, so a
    // cutover swapped configured values for built-in defaults, and it carried
    // three variables nothing reads.
    // The image tag is the one variable that must differ: production names one
    // image, the blue/green pair names two.
    let tags: BTreeSet<&str> = IMAGE_TAG_VARIABLES.iter().copied().collect();
    let strip = |source| -> BTreeSet<String> {
        variables(source)
            .into_iter()
            .filter(|name| !tags.contains(name.as_str()))
            .collect()
    };
    let production = strip(PRODUCTION);
    let bluegreen = strip(BLUEGREEN);
    let only_production: Vec<&String> = production.difference(&bluegreen).collect();
    let only_bluegreen: Vec<&String> = bluegreen.difference(&production).collect();
    assert!(
        only_production.is_empty() && only_bluegreen.is_empty(),
        "the deployment manifests disagree — production only: {only_production:?}, \
         bluegreen only: {only_bluegreen:?}"
    );
}

#[test]
fn no_manifest_forwards_a_variable_nothing_reads() {
    // `CONTROL_PLANE_PROVISIONER_LEASE_TTL_SECONDS`, `_MAX_JOBS` and
    // `_TELEMETRY_TOKEN` sat in the green manifest looking like configuration.
    // They belong to the host agent's own env file; this container read none
    // of them, so setting one did nothing and reading the manifest lied about
    // what the API is tunable by.
    let read = read_by_config();
    // The manifests legitimately carry variables outside config.rs: the
    // database password that composes DATABASE_URL, the image tags, and the
    // Caddy basic-auth hash.
    let manifest_only: BTreeSet<&str> =
        ["CONTROL_PLANE_DB_PASSWORD", "CONTROL_PLANE_BASIC_AUTH_HASH"]
            .into_iter()
            .chain(IMAGE_TAG_VARIABLES.iter().copied())
            .collect();
    for (label, manifest) in [("production", PRODUCTION), ("bluegreen", BLUEGREEN)] {
        let unread: Vec<String> = variables(manifest)
            .into_iter()
            .filter(|name| !read.contains(name) && !manifest_only.contains(name.as_str()))
            .collect();
        assert!(
            unread.is_empty(),
            "deploy/compose.{label}.yml forwards variables the API never reads: {unread:?}"
        );
    }
}
