import { describe, expect, it } from "vitest";
import { installableCardIds } from "@/core/systems/catalog";

/**
 * Which /systems cards may file an approval request.
 *
 * A card is only installable if BOTH halves exist: an active row in the app
 * catalog (otherwise the request API 404s) and a source directory under
 * `system/` (otherwise the approved system 404s at /{org}/{system}). The 173
 * cards fail one half or the other, which is exactly why this gate is pure and
 * unit-tested: the page cannot discover the gap at runtime, it can only ship it.
 */
describe("installableCardIds", () => {
  const active = ["grocery", "pos", "cafe", "clinic"];

  it("keeps only cards backed by both a catalog row and a source", () => {
    const ids = installableCardIds({
      cardIds: ["grocery", "pos", "clinic"],
      activeSlugs: active,
      sourceSlugs: ["grocery", "pos"],
    });
    expect([...ids]).toEqual(["grocery", "pos"]);
  });

  it("drops a catalog-backed card with no source, since it cannot open", () => {
    const ids = installableCardIds({
      cardIds: ["clinic"],
      activeSlugs: active,
      sourceSlugs: ["grocery"],
    });
    expect(ids.has("clinic")).toBe(false);
  });

  it("drops a sourced card with no catalog row, since the request would 404", () => {
    const ids = installableCardIds({
      cardIds: ["pharmacy"],
      activeSlugs: active,
      sourceSlugs: ["grocery", "pharmacy"],
    });
    expect(ids.has("pharmacy")).toBe(false);
  });

  it("returns nothing when the deployment has no sources at all", () => {
    const ids = installableCardIds({
      cardIds: ["grocery"],
      activeSlugs: active,
      sourceSlugs: [],
    });
    expect(ids.size).toBe(0);
  });

  it("preserves the caller's card order", () => {
    const ids = installableCardIds({
      cardIds: ["pos", "grocery", "clinic"],
      activeSlugs: active,
      sourceSlugs: ["grocery", "pos", "clinic"],
    });
    expect([...ids]).toEqual(["pos", "grocery", "clinic"]);
  });

  it("does not match on a prefix, so grocery cannot stand in for grocery-store", () => {
    const ids = installableCardIds({
      cardIds: ["grocery-store"],
      activeSlugs: ["grocery-store", "grocery"],
      sourceSlugs: ["grocery"],
    });
    expect(ids.size).toBe(0);
  });
});