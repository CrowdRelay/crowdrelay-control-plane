//! Outbound delivery for configured end-notifier channels.
//!
//! The Control Plane owns configuration and bounded best-effort attempts;
//! the destination endpoints belong to each tenant's own infrastructure.
//! Discord webhooks are pinned to their official hosts at configuration time,
//! generic webhooks are HTTPS-only, and email rides the optional platform
//! relay webhook (`CONTROL_PLANE_NOTIFY_EMAIL_RELAY_URL`) so this binary never
//! grows an SMTP stack.

use std::{sync::Arc, time::Duration};

use serde_json::{Value, json};

const DELIVERY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct NotifierClient {
    http: reqwest::Client,
    email_relay_url: Option<Arc<str>>,
}

impl NotifierClient {
    pub fn new(email_relay_url: Option<Arc<str>>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(DELIVERY_TIMEOUT)
            .connect_timeout(Duration::from_secs(5))
            .user_agent("crowdrelay-control-plane-notifier/1")
            .build()
            .unwrap_or_default();
        Self {
            http,
            email_relay_url,
        }
    }

    /// Deliver one notification. `Err` carries a short operator-safe reason
    /// recorded on the outbox row.
    pub async fn deliver(
        &self,
        kind: &str,
        label: &str,
        config: &Value,
        event: &str,
        payload: &Value,
    ) -> Result<(), String> {
        match kind {
            "discord" => {
                let url = config
                    .get("url")
                    .and_then(Value::as_str)
                    .ok_or("channel config is missing url")?;
                let body = json!({
                    "content": truncate(format!("[{event}] {label}\n{}", summarize(payload)), 1900),
                    "allowed_mentions": {"parse": []},
                });
                self.post_json(url, &body).await
            }
            "webhook" => {
                let url = config
                    .get("url")
                    .and_then(Value::as_str)
                    .ok_or("channel config is missing url")?;
                let body = json!({
                    "source": "crowdrelay-control-plane",
                    "channel": label,
                    "event": event,
                    "data": payload,
                });
                self.post_json(url, &body).await
            }
            "email_relay" => {
                let relay = self
                    .email_relay_url
                    .as_deref()
                    .ok_or("the platform email relay is not configured")?;
                let to = config
                    .get("to")
                    .and_then(Value::as_str)
                    .ok_or("channel config is missing recipient")?;
                let subject = format!("CrowdRelay [{event}] {label}");
                let body = json!({
                    "to": to,
                    "subject": subject,
                    "text": format!("{event}\n\n{}", summarize(payload)),
                });
                self.post_json(relay, &body).await
            }
            other => Err(format!("unknown channel kind: {other}")),
        }
    }

    async fn post_json(&self, url: &str, body: &Value) -> Result<(), String> {
        let response = self
            .http
            .post(url)
            .json(body)
            .send()
            .await
            .map_err(|error| format!("delivery failed: {error}"))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!(
                "destination answered HTTP {}",
                response.status().as_u16()
            ))
        }
    }
}

fn summarize(payload: &Value) -> String {
    let mut parts = Vec::new();
    if let Some(error_code) = payload.get("errorCode").and_then(Value::as_str) {
        parts.push(format!("code={error_code}"));
    }
    if let Some(detail) = payload.get("errorDetail").and_then(Value::as_str) {
        parts.push(detail.to_owned());
    }
    if let Some(health) = payload.get("health").and_then(Value::as_str) {
        parts.push(format!("health={health}"));
        if let Some(previous) = payload.get("previousHealth").and_then(Value::as_str) {
            parts.push(format!("(was {previous})"));
        }
    }
    if let Some(version) = payload.get("desiredVersion").and_then(Value::as_str) {
        parts.push(format!("version={version}"));
    }
    if parts.is_empty() {
        parts.push(payload.to_string());
    }
    truncate(parts.join(" · "), 800)
}

fn truncate(value: String, max: usize) -> String {
    if value.chars().count() <= max {
        value
    } else {
        let cut: String = value.chars().take(max).collect();
        format!("{cut}…")
    }
}
