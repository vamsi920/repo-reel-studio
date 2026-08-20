export { MarkdownParser } from "./markdown-parser";
export { YAMLConfigParser } from "./yaml-parser";
export { JSONConfigParser } from "./json-parser";
export { TOMLParser } from "./toml-parser";
export { EnvParser } from "./env-parser";
export { DockerfileParser } from "./dockerfile-parser";
export { SQLParser } from "./sql-parser";
export { GraphQLParser } from "./graphql-parser";
export { ProtobufParser } from "./protobuf-parser";
export { TerraformParser } from "./terraform-parser";
export { MakefileParser } from "./makefile-parser";
export { ShellParser } from "./shell-parser";

import type { PluginRegistry } from "../registry";
import { MarkdownParser } from "./markdown-parser";
import { YAMLConfigParser } from "./yaml-parser";
import { JSONConfigParser } from "./json-parser";
import { TOMLParser } from "./toml-parser";
import { EnvParser } from "./env-parser";
import { DockerfileParser } from "./dockerfile-parser";
import { SQLParser } from "./sql-parser";
import { GraphQLParser } from "./graphql-parser";
import { ProtobufParser } from "./protobuf-parser";
import { TerraformParser } from "./terraform-parser";
import { MakefileParser } from "./makefile-parser";
import { ShellParser } from "./shell-parser";

/**
 * Register all built-in non-code parsers with a PluginRegistry.
 */
export function registerAllParsers(registry: PluginRegistry): void {
  registry.register(new MarkdownParser());
  registry.register(new YAMLConfigParser());
  registry.register(new JSONConfigParser());
  registry.register(new TOMLParser());
  registry.register(new EnvParser());
  registry.register(new DockerfileParser());
  registry.register(new SQLParser());
  registry.register(new GraphQLParser());
  registry.register(new ProtobufParser());
  registry.register(new TerraformParser());
  registry.register(new MakefileParser());
  registry.register(new ShellParser());
}
