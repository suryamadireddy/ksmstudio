import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateUniqueSlug,
  collectTakenSlugs,
  fallbackSlug,
  generateSlug,
  resolvePublishSlug,
} from "./slug.ts";

describe("generateSlug", () => {
  it("slugifies ascii titles", () => {
    assert.equal(generateSlug("AI Lease Review for Renters"), "ai-lease-review-for-renters");
  });

  it("returns empty for non-ascii-only titles", () => {
    assert.equal(generateSlug("日本語タイトル"), "");
  });
});

describe("collectTakenSlugs", () => {
  it("includes empty-string slugs so they are not invisible", () => {
    const taken = collectTakenSlugs([
      { portfolio: { slug: "foo" } },
      { portfolio: { slug: "" } },
      { portfolio: null },
      {},
    ]);
    assert.equal(taken.has("foo"), true);
    assert.equal(taken.has(""), true);
    assert.equal(taken.size, 2);
  });
});

describe("allocateUniqueSlug", () => {
  it("uses fallback when preferred is empty", () => {
    assert.equal(allocateUniqueSlug("", new Set(), "abc-123"), "idea-abc123");
  });

  it("suffixes when base is taken", () => {
    assert.equal(
      allocateUniqueSlug("foo", new Set(["foo", "foo-2"]), "id1"),
      "foo-3",
    );
  });

  it("suffixes fallback when empty preferred and fallback is taken", () => {
    const id = "deadbeef-0001";
    const fallback = fallbackSlug(id);
    assert.equal(
      allocateUniqueSlug("", new Set([fallback]), id),
      `${fallback}-2`,
    );
  });
});

describe("resolvePublishSlug", () => {
  it("keeps existing slug when still free", () => {
    assert.equal(
      resolvePublishSlug({
        title: "Other Title",
        ideaId: "id1",
        existingSlug: "kept-slug",
        takenSlugs: new Set(["other"]),
      }),
      "kept-slug",
    );
  });

  it("reallocates when existing slug is claimed by another idea", () => {
    assert.equal(
      resolvePublishSlug({
        title: "Geo News",
        ideaId: "id1",
        existingSlug: "geonews",
        takenSlugs: new Set(["geonews"]),
      }),
      "geo-news",
    );
  });

  it("does not keep empty existing slug", () => {
    assert.equal(
      resolvePublishSlug({
        title: "日本語",
        ideaId: "id-xyz-9",
        existingSlug: "",
        takenSlugs: new Set([""]),
      }),
      fallbackSlug("id-xyz-9"),
    );
  });

  it("avoids unpublished reserved slugs", () => {
    // Idea A unpublished still holds "shared"; idea B must not take it.
    assert.equal(
      resolvePublishSlug({
        title: "Shared",
        ideaId: "idea-b",
        existingSlug: null,
        takenSlugs: new Set(["shared"]),
      }),
      "shared-2",
    );
  });
});
