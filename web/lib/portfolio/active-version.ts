import type { Portfolio, PortfolioVersion } from "@/lib/types";

/** Public/renderable active version: pointer and status must both agree. */
export function findActivePortfolioVersion(
  portfolio: Pick<Portfolio, "versions" | "active_version_id"> | null | undefined,
): PortfolioVersion | undefined {
  if (!portfolio?.versions?.length || !portfolio.active_version_id) {
    return undefined;
  }

  return portfolio.versions.find(
    (v) => v.id === portfolio.active_version_id && v.status === "active",
  );
}
