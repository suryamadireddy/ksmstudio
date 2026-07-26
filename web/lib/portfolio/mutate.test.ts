import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Portfolio, PortfolioVersion } from "../types.ts";
import {
  applyPortfolioMutation,
  portfolioVersionToken,
  resolveNewVersionActivation,
} from "./mutate.ts";

function version(
  partial: Pick<PortfolioVersion, "id" | "status"> &
    Partial<PortfolioVersion>,
): PortfolioVersion {
  return {
    created_at: partial.created_at ?? "2026-07-01T00:00:00.000Z",
    generated_by: partial.generated_by ?? "distillation",
    parent_version_id: partial.parent_version_id ?? null,
    creative_brief: partial.creative_brief ?? null,
    character_card: partial.character_card ?? ({} as PortfolioVersion["character_card"]),
    presentation: partial.presentation ?? ({} as PortfolioVersion["presentation"]),
    public_summary: partial.public_summary ?? { sections: [] },
    chatbot_context:
      partial.chatbot_context ?? ({} as PortfolioVersion["chatbot_context"]),
    voice: partial.voice ?? { summary: "", sample_lines: [] },
    ...partial,
  };
}

function basePortfolio(
  versions: PortfolioVersion[],
  active: string | null,
  extra: Partial<Portfolio> = {},
): Portfolio {
  return {
    published: false,
    published_at: null,
    unpublished_at: null,
    slug: "",
    headline: "",
    versions,
    active_version_id: active,
    updated_at: "2026-07-25T10:00:00.000Z",
    ...extra,
  };
}

describe("resolveNewVersionActivation", () => {
  it("auto-activates the first version", () => {
    const result = resolveNewVersionActivation([], null, "v1");
    assert.deepEqual(result, { status: "active", activeVersionId: "v1" });
  });

  it("keeps subsequent versions draft when active exists", () => {
    const result = resolveNewVersionActivation(
      [version({ id: "v1", status: "active" })],
      "v1",
      "v2",
    );
    assert.deepEqual(result, { status: "draft", activeVersionId: "v1" });
  });

  it("does not claim a cleared active pointer for a new draft", () => {
    const result = resolveNewVersionActivation(
      [version({ id: "v1", status: "archived" })],
      null,
      "v2",
    );
    assert.deepEqual(result, { status: "draft", activeVersionId: null });
  });
});

describe("applyPortfolioMutation", () => {
  it("activate archives the previous active version", () => {
    const current = basePortfolio(
      [
        version({ id: "v1", status: "active" }),
        version({ id: "v2", status: "draft" }),
      ],
      "v1",
    );

    const next = applyPortfolioMutation(current, {
      type: "activate",
      versionId: "v2",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(next.ok, true);
    if (!next.ok) return;
    assert.equal(next.portfolio.active_version_id, "v2");
    assert.equal(next.portfolio.versions[0]?.status, "archived");
    assert.equal(next.portfolio.versions[1]?.status, "active");
    assert.equal(next.portfolio.updated_at, "2026-07-25T12:00:00.000Z");
  });

  it("archive clears active_version_id when archiving the active version", () => {
    const current = basePortfolio(
      [version({ id: "v1", status: "active" })],
      "v1",
    );

    const next = applyPortfolioMutation(current, {
      type: "archive",
      versionId: "v1",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(next.ok, true);
    if (!next.ok) return;
    assert.equal(next.portfolio.active_version_id, null);
    assert.equal(next.portfolio.versions[0]?.status, "archived");
  });

  it("append_version with autoActivateFirst preserves concurrent versions on retry", () => {
    const base = basePortfolio([version({ id: "v1", status: "active" })], "v1");

    // Concurrent branch wrote v1b while distill was running.
    const afterBranch = applyPortfolioMutation(base, {
      type: "append_version",
      version: version({ id: "v1b", status: "draft", parent_version_id: "v1" }),
      now: "2026-07-25T10:01:00.000Z",
    });
    assert.equal(afterBranch.ok, true);
    if (!afterBranch.ok) return;

    // Stale distill (from base) would drop v1b without CAS+retry.
    const staleDistill = applyPortfolioMutation(base, {
      type: "append_version",
      version: version({ id: "v2", status: "draft", parent_version_id: "v1" }),
      autoActivateFirst: true,
      now: "2026-07-25T10:02:00.000Z",
    });
    assert.equal(staleDistill.ok, true);
    if (!staleDistill.ok) return;
    assert.deepEqual(
      staleDistill.portfolio.versions.map((v) => v.id),
      ["v1", "v2"],
    );

    // With CAS, distill retries against the branched portfolio.
    const retried = applyPortfolioMutation(afterBranch.portfolio, {
      type: "append_version",
      version: version({ id: "v2", status: "draft", parent_version_id: "v1" }),
      autoActivateFirst: true,
      now: "2026-07-25T10:03:00.000Z",
    });
    assert.equal(retried.ok, true);
    if (!retried.ok) return;
    assert.deepEqual(
      retried.portfolio.versions.map((v) => v.id),
      ["v1", "v1b", "v2"],
    );
    assert.equal(retried.portfolio.active_version_id, "v1");
    assert.equal(retried.portfolio.versions[2]?.status, "draft");
    assert.notEqual(
      portfolioVersionToken(afterBranch.portfolio),
      portfolioVersionToken(retried.portfolio),
    );
  });

  it("publish preserves versions that landed after a stale read", () => {
    const withVersions = basePortfolio(
      [version({ id: "v1", status: "active" }), version({ id: "v2", status: "draft" })],
      "v1",
      { slug: "my-idea", headline: "Old", updated_at: "2026-07-25T11:00:00.000Z" },
    );

    const published = applyPortfolioMutation(withVersions, {
      type: "publish",
      slug: "my-idea",
      headline: "New headline",
      now: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(published.ok, true);
    if (!published.ok) return;
    assert.equal(published.portfolio.published, true);
    assert.equal(published.portfolio.headline, "New headline");
    assert.equal(published.portfolio.versions.length, 2);
    assert.equal(published.portfolio.active_version_id, "v1");
  });

  it("publish from empty portfolio then distill-retry keeps slug/headline", () => {
    // Distill started before publish; publish wrote slug first.
    const afterPublish = applyPortfolioMutation(null, {
      type: "publish",
      slug: "first-idea",
      headline: "Hello",
      now: "2026-07-25T11:00:00.000Z",
    });
    assert.equal(afterPublish.ok, true);
    if (!afterPublish.ok) return;

    // Distill CAS retries against the published portfolio and must keep metadata.
    const afterDistill = applyPortfolioMutation(afterPublish.portfolio, {
      type: "append_version",
      version: version({ id: "v1", status: "draft" }),
      autoActivateFirst: true,
      now: "2026-07-25T12:00:00.000Z",
    });
    assert.equal(afterDistill.ok, true);
    if (!afterDistill.ok) return;
    assert.equal(afterDistill.portfolio.slug, "first-idea");
    assert.equal(afterDistill.portfolio.headline, "Hello");
    assert.equal(afterDistill.portfolio.published, true);
    assert.equal(afterDistill.portfolio.active_version_id, "v1");
    assert.equal(afterDistill.portfolio.versions[0]?.status, "active");
  });

  it("does not mutate the input portfolio object", () => {
    const current = basePortfolio(
      [version({ id: "v1", status: "active" })],
      "v1",
    );
    const next = applyPortfolioMutation(current, {
      type: "archive",
      versionId: "v1",
      now: "2026-07-25T12:00:00.000Z",
    });
    assert.equal(next.ok, true);
    assert.equal(current.versions[0]?.status, "active");
    assert.equal(current.active_version_id, "v1");
  });
});
