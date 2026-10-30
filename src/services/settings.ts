import {
  DEFAULT_GIT_USER_EMAIL,
  DEFAULT_GIT_USER_NAME,
} from "#/lib/git/clone-instruction";
import { Settings } from "#/types/settings";
import {
  DEFAULT_ROUTING_MODE,
  DEFAULT_ROUTING_POLICY,
} from "#/lib/model-routing/types";

export const LATEST_SETTINGS_VERSION = 5;

export const DEFAULT_SETTINGS: Settings = {
  llm_model: "gemini/gemini-4-argon",
  llm_base_url: "",
  agent: "CodeActAgent",
  language: "en",
  llm_api_key: null,
  llm_api_key_set: false,
  search_api_key_set: false,
  confirmation_mode: false,
  security_analyzer: "llm",
  max_iterations: null,
  remote_runtime_resource_factor: 1,
  provider_tokens_set: {},
  enable_default_condenser: true,
  condenser_max_size: 240,
  enable_sound_notifications: false,
  user_consents_to_analytics: null,
  enable_proactive_conversation_starters: false,
  enable_solvability_analysis: false,
  search_api_key: "",
  is_new_user: true,
  disabled_skills: [],
  mcp_config: {},
  max_budget_per_task: null,
  email: "",
  email_verified: true,
  git_user_name: DEFAULT_GIT_USER_NAME,
  git_user_email: DEFAULT_GIT_USER_EMAIL,
  title_llm_profile: null,
  model_routing_mode: DEFAULT_ROUTING_MODE,
  model_routing_policy: DEFAULT_ROUTING_POLICY,
  model_routing_budget_usd: null,
  model_routing_excluded_profiles: [],
  agent_settings_schema: null,
  agent_settings: {
    schema_version: 6,
    agent_kind: "openhands",
    agent: "CodeActAgent",
    llm: {
      model: "gemini/gemini-4-argon",
    },
    condenser: {
      enabled: true,
      max_size: 240,
    },
    verification: {
      critic_enabled: false,
      enable_iterative_refinement: false,
    },
    enable_sub_agents: true,
    tool_concurrency_limit: 4,
    mcp_config: {},
  },
  conversation_settings_schema: null,
  conversation_settings: {
    schema_version: 1,
    confirmation_mode: false,
    security_analyzer: "llm",
  },
};

/**
 * Get the default settings
 */
export const getDefaultSettings = (): Settings => DEFAULT_SETTINGS;
