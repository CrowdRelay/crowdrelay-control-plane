//! Shared network guard helpers for validating upstream and webhook targets.
//!
//! Two complementary predicates:
//!
//! - [`is_private_target`] — true for loopback, private, link-local, and
//!   Docker-internal DNS names. Used by `tenant_area_client` to *require*
//!   private upstreams (the AREA management surface lives on a private
//!   network).
//!
//! - [`is_blocked_egress_target`] — true for loopback, private, link-local,
//!   multicast, CGNAT, cloud-metadata IPs, and known metadata hostnames.
//!   Used by `validation` and `notifier_client` to *reject* webhook targets
//!   that would let a tenant exfiltrate or hit internal services (SSRF).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::{Host, Url};

// ── Private-target predicate (tenant_area_client upstreams) ─────────────

/// True for loopback, private, link-local, and Docker-internal DNS names.
/// Used to *require* that tenant upstream targets are on a private network.
pub fn is_private_target(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(name)) => is_private_dns_name(name),
        Some(Host::Ipv4(ip)) => private_v4(ip),
        Some(Host::Ipv6(ip)) => private_v6(ip),
        None => false,
    }
}

fn private_v4(ip: Ipv4Addr) -> bool {
    ip.is_loopback() || ip.is_private()
}

fn private_v6(ip: Ipv6Addr) -> bool {
    ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00
}

/// True if a resolved IP address is private (loopback or private range).
/// Used by `tenant_area_client` to revalidate that a DNS name that passed
/// `is_private_target` at config time still resolves to a private address
/// at request time, closing the DNS rebinding gap.
pub fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => private_v4(v4),
        IpAddr::V6(v6) => private_v6(v6),
    }
}

/// Accept `localhost` plus Docker-internal hostnames that resolve to private
/// addresses. Docker service names like `area-management-proxy` are inherently
/// private — they only resolve inside a Docker network and never route to a
/// public IP.
fn is_private_dns_name(name: &str) -> bool {
    name.eq_ignore_ascii_case("localhost")
        || name.eq_ignore_ascii_case("host.docker.internal")
        || name.contains('-')
            && !name.contains('.')
            && name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

// ── Blocked-egress predicate (webhook SSRF guard) ───────────────────────

/// True if the host is a known cloud-metadata hostname that should be blocked
/// even before DNS resolution (defense against DNS rebinding and common
/// metadata endpoints).
fn is_metadata_dns_name(name: &str) -> bool {
    name.eq_ignore_ascii_case("metadata.google.internal")
        || name.eq_ignore_ascii_case("metadata")
        || name.eq_ignore_ascii_case("169.254.169.254")
}

/// True for loopback, private, link-local, multicast, CGNAT, and reserved
/// IPv4 ranges — any address a webhook target must NOT resolve to.
fn blocked_v4(ip: Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local() // 169.254.0.0/16 — includes cloud metadata
        || ip.is_multicast() // 224.0.0.0/4
        || ip.is_broadcast() // 255.255.255.255
        || ip.is_unspecified() // 0.0.0.0
        || ip.is_documentation() // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
        || is_cgnat_v4(ip) // 100.64.0.0/10
}

/// True for loopback, private (unique-local), link-local, multicast, and
/// reserved IPv6 ranges.
fn blocked_v6(ip: Ipv6Addr) -> bool {
    ip.is_loopback()
        || (ip.segments()[0] & 0xfe00) == 0xfc00 // unique-local fc00::/7
        || (ip.segments()[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
        || ip.is_multicast() // ff00::/8
        || ip.is_unspecified() // ::
}

/// CGNAT range 100.64.0.0/10 (RFC 6598). Not covered by std `is_private`.
fn is_cgnat_v4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (octets[1] & 0xc0) == 64
}

/// True if a resolved IP address is in a blocked egress range.
pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => blocked_v4(v4),
        IpAddr::V6(v6) => blocked_v6(v6),
    }
}

/// True if a URL's host is a blocked egress target — either a known metadata
/// hostname or an IP in a blocked range. Does NOT resolve DNS; for DNS names
/// that are not metadata hostnames, returns false (the caller must resolve
/// and check [`is_blocked_ip`] at send time for defense-in-depth against
/// DNS rebinding).
pub fn is_blocked_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(name)) => is_metadata_dns_name(name),
        Some(Host::Ipv4(ip)) => blocked_v4(ip),
        Some(Host::Ipv6(ip)) => blocked_v6(ip),
        None => true, // no host = blocked
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── is_private_target (upstream requirement) ──

    #[test]
    fn private_target_accepts_loopback_and_private() {
        assert!(is_private_target(
            &Url::parse("http://127.0.0.1:8080").unwrap()
        ));
        assert!(is_private_target(
            &Url::parse("http://10.0.0.1:8080").unwrap()
        ));
        assert!(is_private_target(
            &Url::parse("http://localhost:8080").unwrap()
        ));
        assert!(is_private_target(
            &Url::parse("http://area-management-proxy:8080").unwrap()
        ));
    }

    #[test]
    fn private_target_rejects_public() {
        assert!(!is_private_target(
            &Url::parse("http://example.com:8080").unwrap()
        ));
        assert!(!is_private_target(
            &Url::parse("http://8.8.8.8:8080").unwrap()
        ));
    }

    // ── is_blocked_host (webhook SSRF guard) ──

    #[test]
    fn blocked_host_rejects_loopback() {
        assert!(is_blocked_host(&Url::parse("https://127.0.0.1").unwrap()));
        assert!(is_blocked_host(&Url::parse("https://[::1]").unwrap()));
    }

    #[test]
    fn blocked_host_rejects_private_ranges() {
        assert!(is_blocked_host(&Url::parse("https://10.0.0.1").unwrap()));
        assert!(is_blocked_host(&Url::parse("https://192.168.1.1").unwrap()));
        assert!(is_blocked_host(&Url::parse("https://172.16.0.1").unwrap()));
    }

    #[test]
    fn blocked_host_rejects_link_local_and_metadata() {
        assert!(is_blocked_host(
            &Url::parse("https://169.254.169.254").unwrap()
        ));
        assert!(is_blocked_host(
            &Url::parse("https://metadata.google.internal").unwrap()
        ));
        assert!(is_blocked_host(&Url::parse("https://metadata").unwrap()));
    }

    #[test]
    fn blocked_host_rejects_multicast_and_cgnat() {
        assert!(is_blocked_host(&Url::parse("https://224.0.0.1").unwrap()));
        assert!(is_blocked_host(&Url::parse("https://100.64.0.1").unwrap()));
    }

    #[test]
    fn blocked_host_accepts_public() {
        assert!(!is_blocked_host(
            &Url::parse("https://example.com").unwrap()
        ));
        assert!(!is_blocked_host(
            &Url::parse("https://discord.com").unwrap()
        ));
        assert!(!is_blocked_host(&Url::parse("https://8.8.8.8").unwrap()));
    }

    #[test]
    fn blocked_ip_checks_resolved_addresses() {
        assert!(is_blocked_ip("127.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("169.254.169.254".parse().unwrap()));
        assert!(is_blocked_ip("10.0.0.1".parse().unwrap()));
        assert!(!is_blocked_ip("8.8.8.8".parse().unwrap()));
        assert!(!is_blocked_ip("1.1.1.1".parse().unwrap()));
    }
}
