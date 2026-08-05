import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeAuthNextPath } from "./safe-next.ts";

describe("safeAuthNextPath", () => {
  it("allows same-origin relative paths", () => {
    assert.equal(safeAuthNextPath("/studio"), "/studio");
    assert.equal(safeAuthNextPath("/studio/ideas/1"), "/studio/ideas/1");
    assert.equal(safeAuthNextPath("/studio?tab=portfolio"), "/studio?tab=portfolio");
  });

  it("rejects userinfo open-redirect payloads used with origin concatenation", () => {
    // `${origin}${next}` with next=@evil.com → https://origin@evil.com (host evil.com)
    assert.equal(safeAuthNextPath("@evil.com"), "/studio");
    assert.equal(safeAuthNextPath("evil.com"), "/studio");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    assert.equal(safeAuthNextPath("//evil.com"), "/studio");
    assert.equal(safeAuthNextPath("//evil.com/phish"), "/studio");
    assert.equal(safeAuthNextPath("https://evil.com"), "/studio");
    assert.equal(safeAuthNextPath("http://evil.com/path"), "/studio");
  });

  it("rejects backslash host confusion", () => {
    assert.equal(safeAuthNextPath("/\\evil.com"), "/studio");
  });

  it("falls back for empty or missing values", () => {
    assert.equal(safeAuthNextPath(null), "/studio");
    assert.equal(safeAuthNextPath(undefined), "/studio");
    assert.equal(safeAuthNextPath(""), "/studio");
    assert.equal(safeAuthNextPath(null, "/ideas"), "/ideas");
  });
});
