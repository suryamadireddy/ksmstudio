/**
 * Portfolio public URL slug helpers.
 *
 * Spec (publish-and-outcomes-spec): uniqueness is across ALL ideas, not only
 * currently published ones. Unpublished ideas keep their slug on unpublish, so
 * a later publish of another idea must not reuse that reserved slug — otherwise
 * republishing the original collides and public `.single()` lookups 404 both.
 */

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Stable non-empty fallback when title slugifies to empty (e.g. non-ASCII). */
export function fallbackSlug(ideaId: string): string {
  const compact = ideaId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  return compact ? `idea-${compact}` : "idea-untitled";
}

/**
 * Build the set of slugs already claimed by other ideas.
 * Empty-string slugs count — callers must not treat "" as "no slug".
 */
export function collectTakenSlugs(
  rows: Array<{ portfolio?: { slug?: string | null } | null }>,
): Set<string> {
  const taken = new Set<string>();
  for (const row of rows) {
    const slug = row.portfolio?.slug;
    if (typeof slug === "string") taken.add(slug);
  }
  return taken;
}

export function allocateUniqueSlug(
  preferred: string,
  taken: Iterable<string>,
  ideaId: string,
): string {
  const takenSet = taken instanceof Set ? taken : new Set(taken);
  let base = preferred.trim();
  if (!base) base = fallbackSlug(ideaId);

  if (!takenSet.has(base)) return base;
  let n = 2;
  while (takenSet.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Prefer the idea's existing slug when it is non-empty and still free.
 * Otherwise allocate from the title (with non-empty fallback).
 */
export function resolvePublishSlug(opts: {
  title: string;
  ideaId: string;
  existingSlug?: string | null;
  takenSlugs: Iterable<string>;
}): string {
  const { title, ideaId, existingSlug, takenSlugs } = opts;
  const takenSet = takenSlugs instanceof Set ? takenSlugs : new Set(takenSlugs);
  const existing = existingSlug?.trim() ?? "";

  if (existing && !takenSet.has(existing)) return existing;

  return allocateUniqueSlug(generateSlug(title), takenSet, ideaId);
}
