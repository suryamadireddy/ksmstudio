import assert from "node:assert/strict";
import { findActivePortfolioVersion } from "./active-version.ts";
import type { Portfolio } from "../types.ts";

function portfolio(
  active_version_id: string | null,
  versions: Array<{ id: string; status: "active" | "archived" | "draft" }>,
): Portfolio {
  return {
    published: true,
    published_at: "2026-01-01T00:00:00Z",
    unpublished_at: null,
    slug: "example",
    headline: "Example",
    versions: versions as Portfolio["versions"],
    active_version_id,
    public_summary: null,
    chatbot_context: null,
  };
}

assert.equal(
  findActivePortfolioVersion(
    portfolio("v2", [
      { id: "v1", status: "archived" },
      { id: "v2", status: "active" },
    ]),
  )?.id,
  "v2",
);

assert.equal(
  findActivePortfolioVersion(
    portfolio("v2", [
      { id: "v1", status: "archived" },
      { id: "v2", status: "draft" },
    ]),
  ),
  undefined,
);

assert.equal(
  findActivePortfolioVersion(
    portfolio(null, [
      { id: "v1", status: "archived" },
      { id: "v2", status: "draft" },
    ]),
  ),
  undefined,
);

console.log("active-version tests passed");
