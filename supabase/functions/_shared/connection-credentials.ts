/**
 * Merges a connection's already-stored secret fields with the ones just
 * submitted in a `connections-set-credentials` request.
 *
 * `credential-request-sheet.tsx` deliberately narrows its form to "a secret
 * rotation on an already-connected provider" -- it only shows (and therefore
 * only submits) the specific secret field(s) the agent asked to rotate, plus
 * every non-secret field. For a connector with more than one secret field
 * (AWS Bedrock's `secretAccessKey` + optional `sessionToken`, Datadog's
 * `apiKey` + optional `appKey`), that means `submitted` never contains the
 * field(s) not being rotated. Encrypting `submitted` alone and upserting it
 * as the connection's entire `encrypted_credentials` blob would silently
 * delete every stored secret this request didn't happen to mention.
 *
 * `existing` is filtered against `allowedSecretNames` so a field the
 * manifest no longer declares (e.g. removed in a later registry update)
 * cannot be carried forward forever; `submitted` always wins over `existing`
 * for the same field name, since that is the actual rotation.
 */
export function mergeConnectionCredentials(
  allowedSecretNames: Set<string> | string[],
  existing: Record<string, string>,
  submitted: Record<string, string>,
): Record<string, string> {
  const allowed =
    allowedSecretNames instanceof Set
      ? allowedSecretNames
      : new Set(allowedSecretNames);

  const merged: Record<string, string> = {};
  for (const [name, value] of Object.entries(existing)) {
    if (allowed.has(name)) merged[name] = value;
  }
  for (const [name, value] of Object.entries(submitted)) {
    merged[name] = value;
  }
  return merged;
}
