use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelOption {
    pub id: String,
    pub provider: String,
    pub label: String,
    pub cli_model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effort_levels: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub supports_fast_mode: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentModelSectionStatus {
    Ready,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelSection {
    pub id: String,
    pub label: String,
    pub status: AgentModelSectionStatus,
    pub options: Vec<AgentModelOption>,
}

pub fn static_model_sections() -> Vec<AgentModelSection> {
    vec![
        AgentModelSection {
            id: "claude".to_string(),
            label: "Claude Code".to_string(),
            status: AgentModelSectionStatus::Ready,
            options: vec![
                claude_model(
                    "default",
                    "Opus 4.7 1M",
                    &["low", "medium", "high", "xhigh", "max"],
                    false,
                ),
                claude_model(
                    "claude-opus-4-6[1m]",
                    "Opus 4.6 1M",
                    &["low", "medium", "high", "max"],
                    true,
                ),
                claude_model("sonnet", "Sonnet", &["low", "medium", "high", "max"], false),
                claude_model("haiku", "Haiku", &[], false),
            ],
        },
        AgentModelSection {
            id: "codex".to_string(),
            label: "Codex".to_string(),
            status: AgentModelSectionStatus::Ready,
            options: vec![
                codex_model("gpt-5.5", "GPT-5.5"),
                codex_model("gpt-5.4", "GPT-5.4"),
                codex_model("gpt-5.4-mini", "GPT-5.4-Mini"),
                codex_model("gpt-5.3-codex", "GPT-5.3-Codex"),
                codex_model("gpt-5.3-codex-spark", "GPT-5.3-Codex-Spark"),
                codex_model("gpt-5.2", "GPT-5.2"),
            ],
        },
    ]
}

pub fn model_sections() -> Vec<AgentModelSection> {
    let mut sections = static_model_sections();
    match crate::settings::load_custom_providers() {
        Ok(providers) => {
            sections.extend(providers.into_iter().map(custom_provider_section));
        }
        Err(error) => {
            tracing::warn!("Failed to load custom providers for model catalog: {error:#}");
        }
    }
    sections
}

fn custom_provider_section(provider: crate::settings::CustomProviderSettings) -> AgentModelSection {
    let provider_id = custom_provider_id(&provider.id);
    let options = custom_provider_models(&provider, &provider_id);
    AgentModelSection {
        id: provider_id.clone(),
        label: provider.name,
        status: AgentModelSectionStatus::Ready,
        options,
    }
}

fn custom_provider_models(
    provider: &crate::settings::CustomProviderSettings,
    provider_id: &str,
) -> Vec<AgentModelOption> {
    provider
        .models
        .iter()
        .filter_map(|mapped_model| {
            let mapped_model = mapped_model.trim();
            if mapped_model.is_empty() {
                return None;
            }
            Some(AgentModelOption {
                id: custom_model_id(&provider.id, mapped_model),
                provider: provider_id.to_string(),
                label: mapped_model.to_string(),
                cli_model: "sonnet".to_string(),
                runtime_provider: Some("claude".to_string()),
                effort_levels: ["low", "medium", "high", "max"]
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                supports_fast_mode: false,
            })
        })
        .collect()
}

fn claude_model(
    id: &str,
    label: &str,
    effort_levels: &[&str],
    supports_fast_mode: bool,
) -> AgentModelOption {
    AgentModelOption {
        id: id.to_string(),
        provider: "claude".to_string(),
        label: label.to_string(),
        cli_model: id.to_string(),
        runtime_provider: None,
        effort_levels: effort_levels
            .iter()
            .map(|level| level.to_string())
            .collect(),
        supports_fast_mode,
    }
}

fn codex_model(id: &str, label: &str) -> AgentModelOption {
    AgentModelOption {
        id: id.to_string(),
        provider: "codex".to_string(),
        label: label.to_string(),
        cli_model: id.to_string(),
        runtime_provider: None,
        effort_levels: ["low", "medium", "high", "xhigh"]
            .into_iter()
            .map(str::to_string)
            .collect(),
        supports_fast_mode: true,
    }
}

/// Resolved model info needed by the streaming path.
#[derive(Debug, Clone)]
pub struct ResolvedModel {
    pub id: String,
    pub provider: String,
    pub runtime_provider: String,
    pub cli_model: String,
    pub anthropic_base_url: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub anthropic_default_opus_model: Option<String>,
    pub anthropic_default_sonnet_model: Option<String>,
    pub anthropic_default_haiku_model: Option<String>,
}

/// Resolve a model ID to provider + cli_model. Provider is inferred from the
/// ID: `gpt-*` → codex, everything else → claude. The ID is passed through
/// as cli_model directly — the sidecar/SDK handles the actual mapping.
pub fn resolve_model(model_id: &str) -> ResolvedModel {
    let provider = if model_id.starts_with("gpt-") {
        "codex"
    } else {
        "claude"
    };
    ResolvedModel {
        id: model_id.to_string(),
        provider: provider.to_string(),
        runtime_provider: provider.to_string(),
        cli_model: model_id.to_string(),
        anthropic_base_url: None,
        anthropic_api_key: None,
        anthropic_default_opus_model: None,
        anthropic_default_sonnet_model: None,
        anthropic_default_haiku_model: None,
    }
}

pub fn resolve_model_with_settings(model_id: &str) -> ResolvedModel {
    if let Some((provider_id, selected_model)) = parse_custom_model_id(model_id) {
        match crate::settings::load_custom_provider(&provider_id) {
            Ok(Some(provider)) => {
                return ResolvedModel {
                    id: model_id.to_string(),
                    provider: custom_provider_id(&provider.id),
                    runtime_provider: "claude".to_string(),
                    cli_model: "sonnet".to_string(),
                    anthropic_base_url: Some(provider.base_url),
                    anthropic_api_key: Some(provider.api_key),
                    anthropic_default_opus_model: None,
                    anthropic_default_sonnet_model: Some(selected_model),
                    anthropic_default_haiku_model: None,
                };
            }
            Ok(None) => {
                tracing::warn!(provider_id, model_id, "Custom provider not found");
            }
            Err(error) => {
                tracing::warn!(
                    provider_id,
                    model_id,
                    "Failed to load custom provider: {error:#}"
                );
            }
        }
    }
    resolve_model(model_id)
}

pub fn custom_provider_id(id: &str) -> String {
    format!("custom:{id}")
}

fn custom_model_id(provider_id: &str, model: &str) -> String {
    format!("custom:{provider_id}:{model}")
}

fn parse_custom_model_id(model_id: &str) -> Option<(String, String)> {
    let rest = model_id.strip_prefix("custom:")?;
    let (provider_id, cli_model) = rest.split_once(':')?;
    if provider_id.trim().is_empty() || cli_model.trim().is_empty() {
        return None;
    }
    Some((provider_id.to_string(), cli_model.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn static_model_sections_returns_hardcoded_catalog() {
        let sections = static_model_sections();

        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].id, "claude");
        assert_eq!(sections[0].status, AgentModelSectionStatus::Ready);
        assert_eq!(
            sections[0]
                .options
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["default", "claude-opus-4-6[1m]", "sonnet", "haiku"]
        );
        assert!(sections[0]
            .options
            .iter()
            .any(|model| model.id == "claude-opus-4-6[1m]" && model.supports_fast_mode));

        assert_eq!(sections[1].id, "codex");
        assert_eq!(sections[1].status, AgentModelSectionStatus::Ready);
        assert_eq!(
            sections[1]
                .options
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "gpt-5.5",
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.3-codex",
                "gpt-5.3-codex-spark",
                "gpt-5.2",
            ]
        );
        assert!(sections[1]
            .options
            .iter()
            .all(|model| model.supports_fast_mode));
    }

    #[test]
    fn custom_provider_models_show_mapped_model_ids_only() {
        let provider = crate::settings::CustomProviderSettings {
            id: "mioffice".to_string(),
            name: "Mioffice".to_string(),
            base_url: "https://api.example.com/anthropic".to_string(),
            api_key: "sk-test".to_string(),
            models: vec!["xiaomi/mimo-v2.5".to_string(), "mimo-v2.5-mini".to_string()],
            opus_model: String::new(),
            sonnet_model: String::new(),
            haiku_model: String::new(),
            enabled: true,
        };

        let options = custom_provider_models(&provider, "custom:mioffice");

        assert_eq!(
            options
                .iter()
                .map(|model| (model.id.as_str(), model.label.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("custom:mioffice:xiaomi/mimo-v2.5", "xiaomi/mimo-v2.5"),
                ("custom:mioffice:mimo-v2.5-mini", "mimo-v2.5-mini"),
            ]
        );
        assert!(options
            .iter()
            .all(|model| model.provider == "custom:mioffice"));
    }

    #[test]
    fn resolve_claude_model() {
        let m = resolve_model("default");
        assert_eq!(m.provider, "claude");
        assert_eq!(m.cli_model, "default");
        assert_eq!(m.id, "default");
    }

    #[test]
    fn resolve_opus_model() {
        let m = resolve_model("opus");
        assert_eq!(m.provider, "claude");
        assert_eq!(m.cli_model, "opus");
    }

    #[test]
    fn resolve_sonnet_model() {
        let m = resolve_model("sonnet");
        assert_eq!(m.provider, "claude");
    }

    #[test]
    fn resolve_gpt_model_routes_to_codex() {
        let m = resolve_model("gpt-4o");
        assert_eq!(m.provider, "codex");
        assert_eq!(m.cli_model, "gpt-4o");
    }

    #[test]
    fn resolve_gpt_5_4_routes_to_codex() {
        let m = resolve_model("gpt-5.4");
        assert_eq!(m.provider, "codex");
    }

    #[test]
    fn resolve_unknown_model_defaults_to_claude() {
        let m = resolve_model("some-future-model");
        assert_eq!(m.provider, "claude");
        assert_eq!(m.cli_model, "some-future-model");
    }
}
