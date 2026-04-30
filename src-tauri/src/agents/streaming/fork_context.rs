//! Fork-session context prefix builder.
//!
//! When a session is forked there is no provider-side session to resume
//! (no JSONL on disk), so the agent has zero knowledge of the prior
//! conversation. This module builds a compact textual summary of the
//! conversation history that gets prepended to the first prompt of the
//! forked session.
//!
//! # Design: layered context
//!
//! The conversation is split into two layers to balance completeness
//! against the agent's context-window budget:
//!
//! 1. **Bootstrap** – the earliest messages (first user prompt + the
//!    agent's initial response). Always preserved in full up to
//!    [`ForkContextConfig::bootstrap_max_chars`]. This keeps the user's
//!    original intent and the agent's initial plan intact.
//!
//! 2. **Recent turns** – the latest N user/assistant pairs, counted from
//!    the end of the conversation. Provides the most up-to-date context.
//!
//! Messages that fall between the two layers are omitted with a marker.
//! System, error, and result rows are skipped entirely — the Claude Code
//! / Codex SDK reconstructs its own system context (CLAUDE.md, tools,
//! MCP, etc.) for every fresh session.

use rusqlite::params;

/// Layered context budget constants.
struct ForkContextConfig {
    /// Layer 1: bootstrap messages preserved in full.
    bootstrap_max_chars: usize,
    /// Layer 2: number of recent user/assistant turn-pairs to keep.
    recent_turn_count: usize,
    /// Hard cap on the total output string length.
    total_max_chars: usize,
    /// Per-message truncation limit.
    per_message_max_chars: usize,
}

impl Default for ForkContextConfig {
    fn default() -> Self {
        Self {
            bootstrap_max_chars: 8_000,
            recent_turn_count: 20,
            total_max_chars: 30_000,
            per_message_max_chars: 3_000,
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Build a context prefix for a freshly forked session. Returns `None`
/// when the session has no user/assistant messages or the DB read fails.
pub(super) fn build_fork_context_prefix(helmor_session_id: &str) -> Option<String> {
    let config = ForkContextConfig::default();
    let conn = crate::models::db::read_conn().ok()?;

    // Only load the conversation turns the agent needs — system, error,
    // and result rows are skipped because the SDK re-creates them.
    let mut stmt = conn
        .prepare(
            "SELECT role, content FROM session_messages \
             WHERE session_id = ?1 AND role IN ('user', 'assistant') \
             ORDER BY rowid ASC",
        )
        .ok()?;

    let rows: Vec<(String, String)> = stmt
        .query_map(params![helmor_session_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .ok()?
        .filter_map(Result::ok)
        .collect();

    if rows.is_empty() {
        return None;
    }

    build_prefix_from_rows(&rows, &config)
}

// ---------------------------------------------------------------------------
// Core logic (pure — easy to test without a DB)
// ---------------------------------------------------------------------------

fn build_prefix_from_rows(rows: &[(String, String)], config: &ForkContextConfig) -> Option<String> {
    let header = "Previous conversation context (forked from an earlier session):\n";
    let mut context = String::from(header);

    // ── Layer 1: Bootstrap ──────────────────────────────────────────────
    let mut bootstrap_end = 0usize; // exclusive
    for (i, (role, content)) in rows.iter().enumerate() {
        let text = extract_text_from_content(role, content);
        if text.is_empty() {
            continue;
        }
        let label = role_label(role);
        let entry = format_entry(label, &text, config.per_message_max_chars);
        if context.len() + entry.len() - header.len() > config.bootstrap_max_chars {
            // Would exceed bootstrap budget. If this is the very first
            // meaningful entry we still include it (never produce an
            // empty bootstrap); otherwise stop.
            if bootstrap_end == 0 {
                context.push_str(&entry);
                bootstrap_end = i + 1;
            }
            break;
        }
        context.push_str(&entry);
        bootstrap_end = i + 1;
    }

    // Everything fits inside the bootstrap — no truncation needed.
    if bootstrap_end >= rows.len() {
        return finalise(context, config);
    }

    // ── Layer 2: Recent turns ───────────────────────────────────────────
    let recent_start = find_recent_turns_start(rows, bootstrap_end, config.recent_turn_count);

    // Emit a gap marker when there are omitted messages between the two
    // layers. We count by message index (not by "turns") because that is
    // what the user sees in the conversation list.
    if recent_start > bootstrap_end {
        let omitted = recent_start - bootstrap_end;
        context.push_str(&format!("\n[... {omitted} earlier messages omitted ...]"));
    }

    for (role, content) in rows[recent_start..].iter() {
        if context.len() >= config.total_max_chars {
            context.push_str("\n[... remaining messages truncated ...]");
            break;
        }
        let text = extract_text_from_content(role, content);
        if text.is_empty() {
            continue;
        }
        let label = role_label(role);
        context.push_str(&format_entry(label, &text, config.per_message_max_chars));
    }

    finalise(context, config)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Map a DB role string to a human-readable label. Returns `None` for
/// roles we skip (system, error, result, …).
fn role_label(role: &str) -> Option<&'static str> {
    match role {
        "user" => Some("User"),
        "assistant" => Some("Assistant"),
        _ => None,
    }
}

/// Format a single message entry for the context string.
fn format_entry(label: Option<&str>, text: &str, max_chars: usize) -> String {
    let truncated = truncate_str(text, max_chars);
    match label {
        Some(l) => format!("\n{l}: {truncated}"),
        None => format!("\n{truncated}"),
    }
}

/// Truncate `text` to at most `max_chars`, respecting UTF-8 char boundaries.
fn truncate_str(text: &str, max_chars: usize) -> &str {
    if text.len() <= max_chars {
        return text;
    }
    // Find the last char boundary at or before max_chars.
    let mut end = max_chars;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// Find the start index (in `rows`) of the last `turn_count` user
/// messages, searching backwards from `rows.len()` but not before
/// `search_from`.
fn find_recent_turns_start(
    rows: &[(String, String)],
    search_from: usize,
    turn_count: usize,
) -> usize {
    let mut turns_found = 0usize;
    for i in (search_from..rows.len()).rev() {
        if rows[i].0 == "user" {
            turns_found += 1;
            if turns_found >= turn_count {
                return i;
            }
        }
    }
    search_from
}

/// Return the final context string, or `None` when it contains nothing
/// beyond the header.
fn finalise(context: String, _config: &ForkContextConfig) -> Option<String> {
    let header = "Previous conversation context (forked from an earlier session):\n";
    if context.len() > header.len() {
        Some(context)
    } else {
        None
    }
}

/// Extract readable text from a session message's JSON content.
///
/// `user_prompt` messages carry `{"type":"user_prompt","text":"..."}` —
/// we read the `text` field.  `assistant` messages carry an array of
/// content blocks — we collect only `type: "text"` parts.
pub(super) fn extract_text_from_content(role: &str, content: &str) -> String {
    let Ok(val) = serde_json::from_str::<serde_json::Value>(content) else {
        return String::new();
    };

    match role {
        "user" => val
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        "assistant" => {
            let parts = match val.as_array() {
                Some(a) => a,
                None => return String::new(),
            };
            let mut text = String::new();
            for part in parts {
                if part.get("type").and_then(|v| v.as_str()) == Some("text") {
                    if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                        if !text.is_empty() {
                            text.push('\n');
                        }
                        text.push_str(t);
                    }
                }
            }
            text
        }
        _ => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> ForkContextConfig {
        ForkContextConfig::default()
    }

    /// Helper: build a user_prompt JSON.
    fn user_prompt(text: &str) -> (String, String) {
        (
            "user".into(),
            serde_json::json!({"type": "user_prompt", "text": text}).to_string(),
        )
    }

    /// Helper: build an assistant text block JSON.
    fn assistant_text(text: &str) -> (String, String) {
        (
            "assistant".into(),
            serde_json::json!([{"type": "text", "text": text}]).to_string(),
        )
    }

    /// Helper: build a system row (should be skipped by the query, but
    /// we test the pure function too).
    fn system_row(subtype: &str) -> (String, String) {
        (
            "system".into(),
            serde_json::json!({"type": "system", "subtype": subtype}).to_string(),
        )
    }

    #[test]
    fn empty_returns_none() {
        assert!(build_prefix_from_rows(&[], &config()).is_none());
    }

    #[test]
    fn system_only_returns_none() {
        let rows = vec![system_row("init")];
        // system rows produce empty text → no content beyond header
        assert!(build_prefix_from_rows(&rows, &config()).is_none());
    }

    #[test]
    fn short_conversation_preserved_fully() {
        let rows = vec![
            user_prompt("Fix the login bug"),
            assistant_text("I'll look into the login flow."),
            user_prompt("Also check the signup page"),
            assistant_text("Found the issue in both places."),
        ];
        let result = build_prefix_from_rows(&rows, &config()).unwrap();
        assert!(result.contains("Fix the login bug"));
        assert!(result.contains("I'll look into the login flow."));
        assert!(result.contains("Also check the signup page"));
        assert!(result.contains("Found the issue in both places."));
        assert!(
            !result.contains("omitted"),
            "short conversation should have no omission markers"
        );
    }

    #[test]
    fn bootstrap_preserves_first_turn() {
        // Build a conversation that exceeds bootstrap budget.
        let mut rows = vec![
            user_prompt("Implement auth module"),
            assistant_text("Here's the plan for the auth module: use JWT with refresh tokens."),
        ];
        // Add many more messages to push us past the bootstrap layer.
        for i in 0..50 {
            rows.push(user_prompt(&format!("Turn {i} user message")));
            rows.push(assistant_text(&format!("Turn {i} assistant response")));
        }

        let small_config = ForkContextConfig {
            bootstrap_max_chars: 300,
            recent_turn_count: 5,
            total_max_chars: 5000,
            per_message_max_chars: 3000,
        };
        let result = build_prefix_from_rows(&rows, &small_config).unwrap();
        // Bootstrap must contain the first prompt.
        assert!(
            result.contains("Implement auth module"),
            "bootstrap should preserve the first user prompt"
        );
        // Should have an omission marker.
        assert!(
            result.contains("omitted"),
            "gap between bootstrap and recent should produce a marker"
        );
    }

    #[test]
    fn recent_turns_window_applied() {
        let mut rows = Vec::new();
        for i in 0..100 {
            rows.push(user_prompt(&format!("User message {i}")));
            rows.push(assistant_text(&format!("Assistant reply {i}")));
        }
        let cfg = ForkContextConfig {
            bootstrap_max_chars: 200,
            recent_turn_count: 3,
            total_max_chars: 50_000,
            per_message_max_chars: 3_000,
        };
        let result = build_prefix_from_rows(&rows, &cfg).unwrap();
        // Recent window should include the last 3 turns.
        assert!(result.contains("User message 99"));
        assert!(result.contains("User message 98"));
        assert!(result.contains("User message 97"));
        // Messages in the gap between bootstrap and recent should be omitted.
        assert!(
            !result.contains("User message 50"),
            "mid-gap messages should be omitted by the recent window"
        );
    }

    #[test]
    fn total_char_limit_enforced() {
        // Build a conversation that would be huge with no limit.
        let mut rows = Vec::new();
        for i in 0..200 {
            rows.push(user_prompt(&format!(
                "Long message number {i}: {}",
                "x".repeat(500)
            )));
            rows.push(assistant_text(&format!("Reply {i}: {}", "y".repeat(500))));
        }
        let cfg = ForkContextConfig {
            bootstrap_max_chars: 500,
            recent_turn_count: 100,
            total_max_chars: 2_000,
            per_message_max_chars: 3_000,
        };
        let result = build_prefix_from_rows(&rows, &cfg).unwrap();
        assert!(
            result.len() <= 2_500, // some slack for the truncation markers
            "total length {} should be near the 2000 limit",
            result.len()
        );
        assert!(result.contains("truncated"));
    }

    #[test]
    fn single_message_truncated() {
        let huge = "A".repeat(5_000);
        let rows = vec![user_prompt(&huge)];
        let cfg = ForkContextConfig {
            per_message_max_chars: 100,
            ..config()
        };
        let result = build_prefix_from_rows(&rows, &cfg).unwrap();
        // The extracted text should be truncated to ~100 chars.
        assert!(
            result.len() < 500,
            "single huge message should be truncated"
        );
    }

    #[test]
    fn extract_user_prompt_text() {
        let json = r#"{"type":"user_prompt","text":"hello world"}"#;
        assert_eq!(extract_text_from_content("user", json), "hello world");
    }

    #[test]
    fn extract_assistant_text_parts() {
        let json = r#"[{"type":"text","text":"part one"},{"type":"text","text":"part two"}]"#;
        assert_eq!(
            extract_text_from_content("assistant", json),
            "part one\npart two"
        );
    }

    #[test]
    fn extract_skips_non_text_blocks() {
        let json = r#"[{"type":"tool_use","id":"tu1"},{"type":"text","text":"answer"}]"#;
        assert_eq!(extract_text_from_content("assistant", json), "answer");
    }

    #[test]
    fn extract_returns_empty_for_unparseable() {
        assert_eq!(extract_text_from_content("user", "not json"), "");
    }

    #[test]
    fn extract_returns_empty_for_system_role() {
        let json = r#"{"type":"system","subtype":"init"}"#;
        assert_eq!(extract_text_from_content("system", json), "");
    }

    #[test]
    fn overlap_between_bootstrap_and_recent_no_duplicate() {
        // If the conversation is short enough that bootstrap already
        // covers everything, recent should not duplicate messages.
        let rows = vec![
            user_prompt("First"),
            assistant_text("Reply one"),
            user_prompt("Second"),
            assistant_text("Reply two"),
        ];
        let result = build_prefix_from_rows(&rows, &config()).unwrap();
        // "First" should appear exactly once.
        let count = result.matches("First").count();
        assert_eq!(count, 1, "bootstrap and recent layers must not overlap");
    }

    /// Realistic 100-turn conversation — validates the full layered
    /// pipeline at scale: bootstrap preservation, recent-window
    /// selection, gap omission, total-budget enforcement, and the
    /// absence of duplicate messages across layers.
    #[test]
    fn hundred_turn_conversation_respects_all_layers() {
        let mut rows = Vec::with_capacity(200);
        for i in 0..100 {
            rows.push(user_prompt(&format!(
                "Turn {i}: please fix the {} module. Here is some extra context to make \
                 the message realistic — we need to handle edge cases around \
                 concurrency and error recovery.",
                ["auth", "payment", "notification", "search", "cache"][i % 5],
            )));
            rows.push(assistant_text(&format!(
                "Turn {i}: I've analysed the {} module. The root cause is in the \
                 connection pool — when concurrent requests exceed the limit the pool \
                 deadlocks. I recommend adding a timeout and retry wrapper.",
                ["auth", "payment", "notification", "search", "cache"][i % 5],
            )));
        }

        let result = build_prefix_from_rows(&rows, &config()).unwrap();

        // ── Structural checks ──────────────────────────────────────────
        // Total length within budget (config default = 30 000 + header).
        assert!(
            result.len() <= 32_000,
            "output {} bytes exceeds budget",
            result.len(),
        );

        // Bootstrap: first prompt MUST be present.
        assert!(
            result.contains("Turn 0: please fix the auth module"),
            "bootstrap must preserve the very first user prompt",
        );

        // Recent window: last 3 user turns MUST be present.
        assert!(result.contains("Turn 99: please fix the cache module"));
        assert!(result.contains("Turn 98: please fix the search module"));
        assert!(result.contains("Turn 97: please fix the notification module"));

        // Gap: mid-range messages should be omitted.
        assert!(
            result.contains("omitted"),
            "100-turn conversation should have a gap marker",
        );
        assert!(
            !result.contains("Turn 50: please fix"),
            "Turn 50 should fall in the omitted gap",
        );

        // No duplication: "Turn 0" appears only in bootstrap, not again
        // in the recent window.
        let first_prompt_count = result.matches("Turn 0: please fix the auth").count();
        assert_eq!(
            first_prompt_count, 1,
            "first prompt must not be duplicated across layers",
        );

        // ── Snapshot: pin the output shape for regression detection ─────
        // Use insta's inline snapshot so the test is self-contained and
        // doesn't create external `.snap` files for a pure-logic module.
        //
        // We snapshot a summary rather than the full 30 kB string to keep
        // the assertion readable. The summary captures the structural
        // properties that matter.
        let line_count = result.lines().count();
        let has_ellipsis = result.contains("omitted");
        let starts_with_header =
            result.starts_with("Previous conversation context (forked from an earlier session):");

        insta::assert_debug_snapshot!(
            "hundred_turn_summary",
            (
                result.len(),
                line_count,
                has_ellipsis,
                starts_with_header,
                result.contains("Turn 0:"),
                result.contains("Turn 99:"),
            ),
        );
    }
}
