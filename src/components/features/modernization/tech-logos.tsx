import React from "react";
import {
  SiAndroid,
  SiAngular,
  SiApachekafka,
  SiApachemaven,
  SiApachetomcat,
  SiApple,
  SiAstro,
  SiBlazor,
  SiBootstrap,
  SiBun,
  SiC,
  SiCplusplus,
  SiCypress,
  SiDart,
  SiDeno,
  SiDjango,
  SiDocker,
  SiDotnet,
  SiDrupal,
  SiElasticsearch,
  SiElectron,
  SiElixir,
  SiEmberdotjs,
  SiExpress,
  SiFastapi,
  SiFastify,
  SiFirebase,
  SiFlask,
  SiFlutter,
  SiGin,
  SiGo,
  SiGradle,
  SiGraphql,
  SiHibernate,
  SiHono,
  SiJavascript,
  SiJest,
  SiJquery,
  SiJunit5,
  SiKotlin,
  SiKoa,
  SiKubernetes,
  SiLaravel,
  SiMariadb,
  SiMongodb,
  SiMysql,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiNuget,
  SiOpenjdk,
  SiPerl,
  SiPhoenixframework,
  SiPhp,
  SiPostgresql,
  SiPrisma,
  SiPydantic,
  SiPytest,
  SiPython,
  SiRabbitmq,
  SiReact,
  SiRedis,
  SiRemix,
  SiRuby,
  SiRubyonrails,
  SiRust,
  SiScala,
  SiSpring,
  SiSpringboot,
  SiSqlite,
  SiStrapi,
  SiSupabase,
  SiSvelte,
  SiSwift,
  SiTailwindcss,
  SiTypescript,
  SiVite,
  SiVitest,
  SiVuedotjs,
  SiWordpress,
} from "react-icons/si";
import { Boxes, Database, Server, Globe, Cog, Smartphone } from "lucide-react";
import { cn } from "#/utils/utils";

type IconComponent = React.ComponentType<{
  size?: number | string;
  className?: string;
  color?: string;
  "aria-hidden"?: boolean;
}>;

interface TechLogoEntry {
  Icon: IconComponent;
  /** Brand colour; used for the logo tint. */
  color: string;
  label: string;
}

/**
 * Logos the agent can reference by id in `ask_choice` options and
 * `record_discovery` components. Ids are stable, lower-case, dash-free.
 * Anything unknown renders the generic fallback so a typo never breaks a
 * card. Keep this list in `KNOWN_TECH_LOGO_IDS` order for the brief.
 */
export const TECH_LOGOS: Record<string, TechLogoEntry> = {
  python: { Icon: SiPython, color: "#3776AB", label: "Python" },
  django: { Icon: SiDjango, color: "#092E20", label: "Django" },
  flask: { Icon: SiFlask, color: "#000000", label: "Flask" },
  fastapi: { Icon: SiFastapi, color: "#009688", label: "FastAPI" },
  pydantic: { Icon: SiPydantic, color: "#E92063", label: "Pydantic" },
  pytest: { Icon: SiPytest, color: "#0A9EDC", label: "pytest" },
  javascript: { Icon: SiJavascript, color: "#F7DF1E", label: "JavaScript" },
  typescript: { Icon: SiTypescript, color: "#3178C6", label: "TypeScript" },
  nodejs: { Icon: SiNodedotjs, color: "#5FA04E", label: "Node.js" },
  deno: { Icon: SiDeno, color: "#000000", label: "Deno" },
  bun: { Icon: SiBun, color: "#000000", label: "Bun" },
  express: { Icon: SiExpress, color: "#000000", label: "Express" },
  fastify: { Icon: SiFastify, color: "#000000", label: "Fastify" },
  koa: { Icon: SiKoa, color: "#33333D", label: "Koa" },
  hono: { Icon: SiHono, color: "#E36002", label: "Hono" },
  nestjs: { Icon: SiNestjs, color: "#E0234E", label: "NestJS" },
  react: { Icon: SiReact, color: "#61DAFB", label: "React" },
  nextjs: { Icon: SiNextdotjs, color: "#000000", label: "Next.js" },
  remix: { Icon: SiRemix, color: "#000000", label: "Remix" },
  astro: { Icon: SiAstro, color: "#BC52EE", label: "Astro" },
  vue: { Icon: SiVuedotjs, color: "#4FC08D", label: "Vue" },
  angular: { Icon: SiAngular, color: "#DD0031", label: "Angular" },
  svelte: { Icon: SiSvelte, color: "#FF3E00", label: "Svelte" },
  ember: { Icon: SiEmberdotjs, color: "#E04E39", label: "Ember" },
  jquery: { Icon: SiJquery, color: "#0769AD", label: "jQuery" },
  bootstrap: { Icon: SiBootstrap, color: "#7952B3", label: "Bootstrap" },
  tailwind: { Icon: SiTailwindcss, color: "#06B6D4", label: "Tailwind CSS" },
  vite: { Icon: SiVite, color: "#646CFF", label: "Vite" },
  jest: { Icon: SiJest, color: "#C21325", label: "Jest" },
  vitest: { Icon: SiVitest, color: "#6E9F18", label: "Vitest" },
  cypress: { Icon: SiCypress, color: "#69D3A7", label: "Cypress" },
  java: { Icon: SiOpenjdk, color: "#437291", label: "Java" },
  spring: { Icon: SiSpring, color: "#6DB33F", label: "Spring" },
  springboot: { Icon: SiSpringboot, color: "#6DB33F", label: "Spring Boot" },
  hibernate: { Icon: SiHibernate, color: "#59666C", label: "Hibernate" },
  maven: { Icon: SiApachemaven, color: "#C71A36", label: "Maven" },
  gradle: { Icon: SiGradle, color: "#02303A", label: "Gradle" },
  junit: { Icon: SiJunit5, color: "#25A162", label: "JUnit" },
  tomcat: { Icon: SiApachetomcat, color: "#F8DC75", label: "Tomcat" },
  kotlin: { Icon: SiKotlin, color: "#7F52FF", label: "Kotlin" },
  scala: { Icon: SiScala, color: "#DC322F", label: "Scala" },
  dotnet: { Icon: SiDotnet, color: "#512BD4", label: ".NET" },
  csharp: { Icon: SiDotnet, color: "#512BD4", label: "C#" },
  blazor: { Icon: SiBlazor, color: "#512BD4", label: "Blazor" },
  nuget: { Icon: SiNuget, color: "#004880", label: "NuGet" },
  go: { Icon: SiGo, color: "#00ADD8", label: "Go" },
  gin: { Icon: SiGin, color: "#008ECF", label: "Gin" },
  rust: { Icon: SiRust, color: "#000000", label: "Rust" },
  c: { Icon: SiC, color: "#A8B9CC", label: "C" },
  cpp: { Icon: SiCplusplus, color: "#00599C", label: "C++" },
  php: { Icon: SiPhp, color: "#777BB4", label: "PHP" },
  laravel: { Icon: SiLaravel, color: "#FF2D20", label: "Laravel" },
  wordpress: { Icon: SiWordpress, color: "#21759B", label: "WordPress" },
  drupal: { Icon: SiDrupal, color: "#0678BE", label: "Drupal" },
  ruby: { Icon: SiRuby, color: "#CC342D", label: "Ruby" },
  rails: { Icon: SiRubyonrails, color: "#D30001", label: "Ruby on Rails" },
  perl: { Icon: SiPerl, color: "#39457E", label: "Perl" },
  elixir: { Icon: SiElixir, color: "#4B275F", label: "Elixir" },
  phoenix: { Icon: SiPhoenixframework, color: "#FD4F00", label: "Phoenix" },
  swift: { Icon: SiSwift, color: "#F05138", label: "Swift" },
  ios: { Icon: SiApple, color: "#000000", label: "iOS" },
  android: { Icon: SiAndroid, color: "#34A853", label: "Android" },
  dart: { Icon: SiDart, color: "#0175C2", label: "Dart" },
  flutter: { Icon: SiFlutter, color: "#02569B", label: "Flutter" },
  electron: { Icon: SiElectron, color: "#47848F", label: "Electron" },
  postgresql: { Icon: SiPostgresql, color: "#4169E1", label: "PostgreSQL" },
  mysql: { Icon: SiMysql, color: "#4479A1", label: "MySQL" },
  mariadb: { Icon: SiMariadb, color: "#003545", label: "MariaDB" },
  sqlite: { Icon: SiSqlite, color: "#003B57", label: "SQLite" },
  mongodb: { Icon: SiMongodb, color: "#47A248", label: "MongoDB" },
  redis: { Icon: SiRedis, color: "#FF4438", label: "Redis" },
  elasticsearch: {
    Icon: SiElasticsearch,
    color: "#005571",
    label: "Elasticsearch",
  },
  prisma: { Icon: SiPrisma, color: "#2D3748", label: "Prisma" },
  supabase: { Icon: SiSupabase, color: "#3FCF8E", label: "Supabase" },
  firebase: { Icon: SiFirebase, color: "#DD2C00", label: "Firebase" },
  graphql: { Icon: SiGraphql, color: "#E10098", label: "GraphQL" },
  strapi: { Icon: SiStrapi, color: "#4945FF", label: "Strapi" },
  kafka: { Icon: SiApachekafka, color: "#231F20", label: "Kafka" },
  rabbitmq: { Icon: SiRabbitmq, color: "#FF6600", label: "RabbitMQ" },
  docker: { Icon: SiDocker, color: "#2496ED", label: "Docker" },
  kubernetes: { Icon: SiKubernetes, color: "#326CE5", label: "Kubernetes" },
};

export const KNOWN_TECH_LOGO_IDS = Object.keys(TECH_LOGOS);

/** Generic fallbacks by component kind when no logo id matches. */
const KIND_FALLBACK: Record<string, IconComponent> = {
  frontend: Globe,
  backend: Server,
  api: Server,
  database: Database,
  mobile: Smartphone,
  infra: Cog,
  other: Boxes,
};

/** Resolve a free-text id/label ("Next.js", "nextjs", "next") to a logo id. */
export function resolveTechLogoId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[^a-z0-9+#]/g, "");
  const aliases: Record<string, string> = {
    next: "nextjs",
    nextjs: "nextjs",
    node: "nodejs",
    nodejs: "nodejs",
    vuejs: "vue",
    "c++": "cpp",
    "c#": "csharp",
    cs: "csharp",
    aspnet: "dotnet",
    aspnetcore: "dotnet",
    dotnetcore: "dotnet",
    netcore: "dotnet",
    postgres: "postgresql",
    pg: "postgresql",
    mongo: "mongodb",
    rubyonrails: "rails",
    ror: "rails",
    tailwindcss: "tailwind",
    reactjs: "react",
    angularjs: "angular",
    expressjs: "express",
    golang: "go",
    k8s: "kubernetes",
    sqlserver: "dotnet",
  };
  const id = aliases[key] ?? key;
  return TECH_LOGOS[id] ? id : null;
}

export interface TechLogoProps {
  /** Logo id (see TECH_LOGOS) or free text resolved through aliases. */
  id?: string | null;
  /** Used for the generic fallback when the id is unknown. */
  kind?: string | null;
  size?: number;
  className?: string;
  /** Render in brand colour (default) or inherit text colour. */
  monochrome?: boolean;
}

/** A technology logo with a graceful generic fallback. */
export function TechLogo({
  id,
  kind,
  size = 20,
  className,
  monochrome = false,
}: TechLogoProps) {
  const resolved = resolveTechLogoId(id);
  if (resolved) {
    const { Icon, color, label } = TECH_LOGOS[resolved];
    return (
      <span
        role="img"
        aria-label={label}
        data-testid={`tech-logo-${resolved}`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          className,
        )}
        style={monochrome ? undefined : { color }}
      >
        <Icon size={size} aria-hidden />
      </span>
    );
  }
  const Fallback = KIND_FALLBACK[kind ?? "other"] ?? Boxes;
  return (
    <span
      role="img"
      aria-label={id ?? kind ?? undefined}
      data-testid="tech-logo-fallback"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-[var(--text-tertiary)]",
        className,
      )}
    >
      <Fallback size={size} aria-hidden />
    </span>
  );
}

/** Display label for a logo id, falling back to the raw value. */
export function techLabel(value: string | null | undefined): string {
  const resolved = resolveTechLogoId(value);
  return resolved ? TECH_LOGOS[resolved].label : (value ?? "");
}
