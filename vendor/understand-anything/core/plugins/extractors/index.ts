export type { LanguageExtractor, TreeSitterNode } from "./types";
export { traverse, getStringValue, findChild, findChildren, hasChildOfType } from "./base-extractor";
export { TypeScriptExtractor } from "./typescript-extractor";
export { PythonExtractor } from "./python-extractor";
export { GoExtractor } from "./go-extractor";
export { RustExtractor } from "./rust-extractor";
export { JavaExtractor } from "./java-extractor";
export { RubyExtractor } from "./ruby-extractor";
export { PhpExtractor } from "./php-extractor";
export { CppExtractor } from "./cpp-extractor";
export { CSharpExtractor } from "./csharp-extractor";
export { KotlinExtractor } from "./kotlin-extractor";
export { ScalaExtractor } from "./scala-extractor";

import type { LanguageExtractor } from "./types";
import { TypeScriptExtractor } from "./typescript-extractor";
import { PythonExtractor } from "./python-extractor";
import { GoExtractor } from "./go-extractor";
import { RustExtractor } from "./rust-extractor";
import { JavaExtractor } from "./java-extractor";
import { RubyExtractor } from "./ruby-extractor";
import { PhpExtractor } from "./php-extractor";
import { CppExtractor } from "./cpp-extractor";
import { CSharpExtractor } from "./csharp-extractor";
import { KotlinExtractor } from "./kotlin-extractor";
import { ScalaExtractor } from "./scala-extractor";

export const builtinExtractors: LanguageExtractor[] = [
  new TypeScriptExtractor(),
  new PythonExtractor(),
  new GoExtractor(),
  new RustExtractor(),
  new JavaExtractor(),
  new RubyExtractor(),
  new PhpExtractor(),
  new CppExtractor(),
  new CSharpExtractor(),
  new KotlinExtractor(),
  new ScalaExtractor(),
];
