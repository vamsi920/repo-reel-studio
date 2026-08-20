/** Thrown only by callers that explicitly opt into strict mode (rare -- most
 * repository methods degrade to a benign empty/no-op result instead, so a
 * missing/unreachable Supabase project never breaks a UI interaction). */
export class DataPlatformUnavailableError extends Error {
  constructor(
    message = "Supabase data platform is not configured or unreachable",
  ) {
    super(message);
    this.name = "DataPlatformUnavailableError";
  }
}
