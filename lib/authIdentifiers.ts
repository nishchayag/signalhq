/**
 * Build a safe user lookup from a request body's `email` / `username`.
 *
 * - Only string values are accepted. A JSON object such as
 *   `{"email": {"$gt": ""}}` would otherwise be passed straight into
 *   `$or` as a query operator and match an arbitrary user.
 * - Values are lowercased (both fields are stored lowercase-unique).
 * - The `$or` only contains the fields actually supplied; `{ email:
 *   undefined }` must never reach Mongo.
 *
 * Returns null when neither field is a usable string. `key` is a stable
 * per-account identifier for rate limiting.
 */
export function identifierQuery(body: unknown): {
  filter: { $or: Record<string, string>[] };
  key: string;
} | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const clauses: Record<string, string>[] = [];
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  if (email) clauses.push({ email });
  if (username) clauses.push({ username });
  if (clauses.length === 0) return null;
  return { filter: { $or: clauses }, key: email || username };
}
