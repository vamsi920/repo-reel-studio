import type { FrameworkConfig } from "../types";

import { djangoConfig } from "./django";
import { fastapiConfig } from "./fastapi";
import { flaskConfig } from "./flask";
import { reactConfig } from "./react";
import { nextjsConfig } from "./nextjs";
import { expressConfig } from "./express";
import { vueConfig } from "./vue";
import { springConfig } from "./spring";
import { railsConfig } from "./rails";
import { ginConfig } from "./gin";

export const builtinFrameworkConfigs: FrameworkConfig[] = [
  djangoConfig,
  fastapiConfig,
  flaskConfig,
  reactConfig,
  nextjsConfig,
  expressConfig,
  vueConfig,
  springConfig,
  railsConfig,
  ginConfig,
];

export {
  djangoConfig,
  fastapiConfig,
  flaskConfig,
  reactConfig,
  nextjsConfig,
  expressConfig,
  vueConfig,
  springConfig,
  railsConfig,
  ginConfig,
};
