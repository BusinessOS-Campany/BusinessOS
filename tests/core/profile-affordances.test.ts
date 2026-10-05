import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The profile page must not ship an affordance that does nothing.
 *
 * Every one of these is a defect this repo actually had: a badge comparing
 * against a role string nothing ever writes, a sign-in redirect that drops the
 * org segment, six dictionary keys for an unsaved-changes guard that was never
 * written, a working re-clone endpoint with no button, and a whole credential
 * feature with no way for a member to activate it.
 *
 * Asserted against the source rather than a rendered DOM on purpose. Each rule
 * below is "this file must contain this exact thing", and a headless render
 * cannot distinguish a button that works from one that posts to nothing — which
 * is precisely how the dead affordances survived. It also keeps the suite free
 * of a browser.
 *
 * Fails-first: every rule was red against the code as it stood.
 */

const repoRoot = process.cwd();
const read = (relative: string) => readFileSync(join(repoRoot, relative), "utf8");

describe("profile header", () => {
  it("matches the platform role the gate actually compares", () => {
    const header = read("src/components/profile/profile-header.tsx");
    // Better Auth's admin plugin writes the literal "admin", which is what
    // core/platform/gate.ts compares against. It used to look for
    // "PLATFORM_ADMIN", which no code path produces, so the badge was dead.
    expect(header).toContain('identity.role === "admin"');
    // No comparison against it. A comment explaining the old value is fine and
    // is not what this asserts — this is about the condition, not the prose.
    expect(header).not.toMatch(/identity\.role\s*===\s*"PLATFORM_ADMIN"/);
  });
});

describe("profile screen gate", () => {
  it("keeps the org in the sign-in redirect", () => {
    const screen = read("src/components/profile/profile-screen.tsx");
    // Dropping the org sends the member to /profile after signing in: no
    // systems tab, no add-system button, no rename rights.
    expect(screen).toContain("encodeURIComponent(next)");
    expect(screen).not.toContain('redirect("/signin?next=%2Fprofile")');
  });

  it("builds the redirect target from the org it was given", () => {
    const screen = read("src/components/profile/profile-screen.tsx");
    expect(screen).toContain("orgContext.organizationSlug");
  });
});

describe("profile editor", () => {
  it("guards a close that would discard unsaved edits", () => {
    const editor = read("src/components/profile/profile-editor.tsx");
    expect(editor).toContain("const dirty = useMemo");
    // The guard has to be in the change handler, not only on the Cancel button:
    // Radix also closes on Escape and on the backdrop, and those are the paths a
    // member actually uses by accident.
    expect(editor).toContain("onOpenChange={closeFromDialog}");
    expect(editor).toContain("profile.editor.discardTitle");
    expect(editor).toContain("profile.editor.confirmDiscard");
    expect(editor).toContain("profile.editor.keepEditing");
  });

  it("does not ask about discarding after a successful save", () => {
    const editor = read("src/components/profile/profile-editor.tsx");
    // A saved edit is not a discarded one, so this closes without the guard.
    expect(editor).toContain("if (ok) onOpenChange(false);");
  });
});

describe("profile systems tab", () => {
  it("reaches the re-clone endpoint that already existed", () => {
    const hook = read("src/components/profile/use-profile.ts");
    // POST /api/v1/profile/systems was complete and unreachable.
    expect(hook).toContain('"/api/v1/profile/systems"');
    expect(hook).toContain("reCloneSystem");
  });

  it("offers a way to activate direct sign-in", () => {
    const hook = read("src/components/profile/use-profile.ts");
    expect(hook).toContain("confirmSystemCredential");
    // PUT, not POST: confirming a password is neither a create nor a whole-
    // resource update, and the endpoint enforces that.
    expect(hook).toContain("apiPut");
  });

  it("renders the access row and the confirm form", () => {
    const panel = read("src/components/profile/profile-overview-panel.tsx");
    const view = read("src/components/profile/profile-view.tsx");
    expect(panel).toContain("function SystemAccessRow");
    // A member who cannot see what to type will not guess it.
    expect(panel).toContain("access.username");
    expect(view).toContain("function ConfirmCredentialForm");
    // A social login has nothing to confirm, so no button is offered there.
    expect(panel).toContain("social_login");
  });

  it("scopes the write affordances to the org in the URL", () => {
    const view = read("src/components/profile/profile-view.tsx");
    expect(view).toContain("const isActiveOrg =");
    // Rename, re-clone and confirm must all be gated the same way: the endpoint
    // scopes its write to the active org, so an ungarded button would offer an
    // action that fails for every card not belonging to the URL's org.
    // Whitespace-insensitive, because these are wrapped JSX props and a
    // reformat would otherwise break the assertion rather than the behaviour.
    expect(view).toMatch(/isActiveOrg\s*\?\s*renamingId\s*:\s*null/);
    expect(view).toMatch(/onReClone=\{\s*isActiveOrg\s*\?\s*\(system\)/);
    expect(view).toMatch(/onActivateAccess=\{\s*isActiveOrg\s*\?\s*\(system\)/);
    expect(view).toContain("isActiveOrg && system.id === confirmingId");
  });
});

describe("dictionary coverage", () => {
  it("every profile.systems key used in the UI exists in both locales", () => {
    const dict = read("src/core/i18n/dictionaries.ts");
    const sources = [
      "src/components/profile/profile-overview-panel.tsx",
      "src/components/profile/profile-view.tsx",
      "src/components/profile/use-profile.ts",
    ];
    const used = new Set<string>();
    for (const file of sources) {
      for (const match of read(file).matchAll(/profile\.systems\.([A-Za-z0-9_]+)/g)) {
        used.add(match[1]);
      }
    }
    // The keys added by this change, which had no translations and would render
    // as the raw key.
    for (const key of [
      "access",
      "accessPassword",
      "accessGateway",
      "accessGatewayHint",
      "accessSocial",
      "accessSocialHint",
      "accessPending",
      "accessActivate",
      "accessActivateTitle",
      "accessActivateHint",
      "accessActivateSave",
      "accessCancel",
      "credentialReady",
      "reClone",
      "reCloneHint",
      "reCloneDone",
      "reCloneUnchanged",
    ]) {
      expect(used).toContain(key);
    }
    // Each appears twice: the Arabic block and the English one. One occurrence
    // means a member in the other language sees the key itself.
    for (const key of used) {
      const occurrences = dict.split(`${key}:`).length - 1;
      expect(occurrences, `"profile.systems.${key}" needs an ar and an en entry`).toBeGreaterThanOrEqual(2);
    }
  });

  it("the dictionaries file still declares an Arabic block before an English one", () => {
    const dict = read("src/core/i18n/dictionaries.ts");
    // Anchored to the top-level declarations: a bare "en:" also matches property
    // values, so an unanchored search finds one long before the real block.
    const ar = dict.search(/^const ar = \{/m);
    const en = dict.search(/^const en = \{/m);
    expect(ar).toBeGreaterThan(0);
    expect(en).toBeGreaterThan(ar);
  });
});

describe("no dead imports", () => {
  it("the profile components still import what they use", () => {
    // A rename that left an import behind is the usual way this area rots.
    const files = readdirSync(join(repoRoot, "src/components/profile"));
    for (const file of files.filter((f) => f.endsWith(".tsx"))) {
      const source = read(join("src/components/profile", file));
      const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from/g)].flatMap((m) =>
        m[1].split(",").map((s) => s.trim().split(" as ").pop()!.trim()),
      );
      for (const name of imports) {
        if (!name || name.startsWith("type ")) continue;
        // Count uses outside the import statement itself.
        const body = source.replace(/import\s*\{[^}]+\}\s*from[^\n]+\n/g, "");
        expect(new RegExp(`\\b${name}\\b`).test(body), `${file} imports ${name} but never uses it`).toBe(true);
      }
    }
  });
});
