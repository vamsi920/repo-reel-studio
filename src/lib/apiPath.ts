import { API_URL } from "@/env";

/** Builds an absolute (or root-relative) URL for a backend `/api` path. */
export const resolveApiPath = (path: string): string =>
  API_URL === "/api" ? `/api${path}` : `${API_URL}/api${path}`;
