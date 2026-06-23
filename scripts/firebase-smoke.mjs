/**
 * Firebase integration smoke test (local .env + live gitflick project).
 * Run: node scripts/firebase-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, fetchSignInMethodsForEmail } from "firebase/auth";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const env = loadEnv(resolve(process.cwd(), ".env"));
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const checks = [];

function pass(name, detail = "") {
  checks.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  checks.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

if (!config.apiKey || !config.projectId || !config.appId) {
  fail("env config", "Missing VITE_FIREBASE_* in .env");
  process.exit(1);
}
pass("env config", `project=${config.projectId}`);

if (config.projectId !== "gitflick") {
  fail("project id", `expected gitflick, got ${config.projectId}`);
} else {
  pass("project id", "gitflick");
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

if (!auth.app.name) {
  fail("auth init");
} else {
  pass("auth init");
}

try {
  const methods = await fetchSignInMethodsForEmail(auth, "smoke-test@gitflick.local");
  pass("auth API reachable", `sign-in methods query ok (${methods.length} methods for probe email)`);
} catch (error) {
  const code = error?.code ?? error?.message ?? String(error);
  if (String(code).includes("auth/invalid-email")) {
    pass("auth API reachable", "invalid probe email rejected as expected");
  } else {
    fail("auth API reachable", String(code));
  }
}

try {
  await getDocs(query(collection(db, "projects"), limit(1)));
  fail("firestore rules", "unauthenticated read should be denied");
} catch (error) {
  const code = error?.code ?? "";
  if (code === "permission-denied" || String(error).includes("Missing or insufficient permissions")) {
    pass("firestore rules", "unauthenticated read denied (expected)");
  } else {
    fail("firestore rules", `${code || error}`);
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
