import type { Portfolio, PortfolioVersion } from "@/lib/types";

export function emptyPortfolio(): Portfolio {
  return {
    published: false,
    published_at: null,
    unpublished_at: null,
    slug: "",
    headline: "",
    versions: [],
    active_version_id: null,
  };
}

/** Version token used for optimistic concurrency on the portfolio JSONB blob. */
export function portfolioVersionToken(
  portfolio: Portfolio | null | undefined,
): string | null {
  return portfolio?.updated_at ?? null;
}

/**
 * Decide status + active pointer for a newly distilled/branched version.
 * First version auto-activates; later versions stay draft even if the active
 * pointer was cleared (e.g. after archiving the previous active version).
 */
export function resolveNewVersionActivation(
  priorVersions: PortfolioVersion[],
  currentActiveId: string | null | undefined,
  versionId: string,
): { status: PortfolioVersion["status"]; activeVersionId: string | null } {
  if (priorVersions.length === 0) {
    return { status: "active", activeVersionId: versionId };
  }
  return { status: "draft", activeVersionId: currentActiveId ?? null };
}

export type PortfolioMutation =
  | { type: "activate"; versionId: string; now?: string }
  | { type: "archive"; versionId: string; now?: string }
  | {
      type: "append_version";
      version: PortfolioVersion;
      /** When true, first version becomes active (distill/branch). */
      autoActivateFirst?: boolean;
      now?: string;
    }
  | {
      type: "publish";
      slug: string;
      headline: string;
      publishedAt?: string;
      now?: string;
    }
  | { type: "unpublish"; now?: string };

export type PortfolioMutateResult =
  | { ok: true; portfolio: Portfolio }
  | { ok: false; error: string };

function clonePortfolio(current: Portfolio | null | undefined): Portfolio {
  const base = current ?? emptyPortfolio();
  return {
    ...base,
    versions: [...(base.versions ?? [])],
  };
}

/**
 * Pure portfolio JSONB mutation. Callers persist with compare-and-swap on
 * `updated_at` so concurrent writers cannot silently drop versions or
 * undo publish/activation metadata.
 */
export function applyPortfolioMutation(
  current: Portfolio | null | undefined,
  mutation: PortfolioMutation,
): PortfolioMutateResult {
  const now = mutation.now ?? new Date().toISOString();
  const portfolio = clonePortfolio(current);

  if (mutation.type === "activate") {
    const exists = portfolio.versions.some((v) => v.id === mutation.versionId);
    if (!exists) return { ok: false, error: "version_not_found" };

    portfolio.versions = portfolio.versions.map((v) => {
      if (v.id === mutation.versionId) return { ...v, status: "active" };
      if (v.status === "active") return { ...v, status: "archived" };
      return v;
    });
    portfolio.active_version_id = mutation.versionId;
    portfolio.updated_at = now;
    return { ok: true, portfolio };
  }

  if (mutation.type === "archive") {
    const exists = portfolio.versions.some((v) => v.id === mutation.versionId);
    if (!exists) return { ok: false, error: "version_not_found" };

    portfolio.versions = portfolio.versions.map((v) =>
      v.id === mutation.versionId ? { ...v, status: "archived" } : v,
    );
    if (portfolio.active_version_id === mutation.versionId) {
      portfolio.active_version_id = null;
    }
    portfolio.updated_at = now;
    return { ok: true, portfolio };
  }

  if (mutation.type === "append_version") {
    const prior = portfolio.versions;
    let version = mutation.version;

    if (mutation.autoActivateFirst) {
      const { status, activeVersionId } = resolveNewVersionActivation(
        prior,
        portfolio.active_version_id,
        version.id,
      );
      version = {
        ...version,
        status,
        parent_version_id:
          version.parent_version_id ?? (prior.at(-1)?.id ?? null),
      };
      portfolio.active_version_id = activeVersionId;
    }

    portfolio.versions = [...prior, version];
    portfolio.updated_at = now;
    return { ok: true, portfolio };
  }

  if (mutation.type === "publish") {
    portfolio.published = true;
    portfolio.published_at =
      portfolio.published_at ?? mutation.publishedAt ?? now;
    portfolio.unpublished_at = null;
    portfolio.slug = portfolio.slug || mutation.slug;
    portfolio.headline = mutation.headline;
    portfolio.updated_at = now;
    return { ok: true, portfolio };
  }

  // unpublish
  portfolio.published = false;
  portfolio.unpublished_at = now;
  portfolio.updated_at = now;
  return { ok: true, portfolio };
}
