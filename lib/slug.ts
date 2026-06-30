// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = import("mongoose").Model<any>;

/** Lowercase, alphanumeric + single hyphens, trimmed to 40 chars. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Produce a slug derived from `name` that is unique for the given model under
 * `extraFilter` (e.g. scoping team slugs per-organization). Appends -2, -3, …
 * on collision.
 */
export async function uniqueSlug(
  name: string,
  model: AnyModel,
  extraFilter: Record<string, unknown> = {},
  fallback = "org"
): Promise<string> {
  const base = slugify(name) || fallback;
  let slug = base;
  let n = 1;
  while (await model.findOne({ ...extraFilter, slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}
