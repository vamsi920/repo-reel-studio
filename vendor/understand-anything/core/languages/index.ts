// Types
export type {
  LanguageConfig,
  TreeSitterConfig,
  FilePatternConfig,
  FrameworkConfig,
} from "./types";

export {
  LanguageConfigSchema,
  TreeSitterConfigSchema,
  FilePatternConfigSchema,
  FrameworkConfigSchema,
} from "./types";

// Registries
export { LanguageRegistry } from "./language-registry";
export { FrameworkRegistry } from "./framework-registry";

// Built-in configs
export { builtinLanguageConfigs } from "./configs/index";
export { builtinFrameworkConfigs } from "./frameworks/index";
