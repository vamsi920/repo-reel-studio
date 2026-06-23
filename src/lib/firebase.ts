// Firebase removed — all data is stored locally.
// These null exports satisfy any remaining imports without crashing.

export const firebaseApp = null;
export const auth = null;
export const db = null;
export const storage = null;
export const firebaseInitError = null;
export const isFirebaseConfigured = false;

export function getFirebaseAnalytics(): Promise<null> {
  return Promise.resolve(null);
}
