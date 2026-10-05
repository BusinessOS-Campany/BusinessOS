import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import { respondToScopeProblem } from "@/core/systems/runtime/scope";

/**
 * The `/{org}/{system}` route answers an unauthorized caller with a redirect, and
 * that redirect is addressed to the browser rather than to a server.
 *
 * Behind the Cloudflare tunnel the request that reaches this code has already
 * been re-issued, so `request.url` describes the platform's own origin
 * (`https://localhost:3100`), not the host the visitor typed. Building a
 * `Location` from it produced
 * `307 Location: https://localhost:3100/signin?next=%2Fajwad%2Fgrocery` — a
 * public scheme on a loopback host, which no browser can open. Clicking an app
 * while signed out therefore dead-ended on a connection error rather than
 * reaching the sign-in form.
 *
 * The fix is the one already proven in the grocery app's own `api/auth/expire`:
 * a path-only `Location`, which the browser resolves against the address bar, so
 * the result is identical on every hostname. These tests are DB-free on purpose —
 * the function is pure, and the failure it prevents is only observable over the
 * public host, which is verified separately.
 */

describe("org system scope problem responses", () => {
  it("sends an unauthenticated caller to sign-in by a relative path", () => {
    const res = respondToScopeProblem({ kind: "unauthenticated" }, "ajwad", "grocery");

    expect(res.status).toBe(307);
    // No scheme, no host: the browser fills both in from the address bar.
    expect(res.headers.get("location")).toBe("/signin?next=%2Fajwad%2Fgrocery");
  });

  it("never leaks the server's own origin into a Location", () => {
    // The regression this whole file exists for. Behind the tunnel every request
    // the public host makes arrives here with `request.url` naming `localhost`,
    // so any absolute Location built from it is a dead link in production while
    // looking correct when tested against localhost.
    for (const [org, system] of [
      ["ajwad", "grocery"],
      ["p967775008926", "grocery"],
    ] as const) {
      const location = respondToScopeProblem({ kind: "unauthenticated" }, org, system).headers.get(
        "location",
      );

      expect(location).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
      expect(location).not.toContain("localhost");
      expect(location).not.toContain("127.0.0.1");
      expect(location?.startsWith("//")).toBe(false);
    }
  });

  it("preserves the app path the visitor asked for as `next`", () => {
    // `next` is the system root, not the full request path: the sign-in form
    // returns the caller to the app, and the app's own routing decides what the
    // segment after the system name means.
    const res = respondToScopeProblem({ kind: "unauthenticated" }, "ajwad", "grocery");
    expect(res.headers.get("location")).toBe("/signin?next=%2Fajwad%2Fgrocery");
  });

  it("sends an inactive org's member to the org picker by a relative path", () => {
    for (const status of ["pending", "suspended", "cancelled", "rejected"]) {
      const res = respondToScopeProblem({ kind: "inactive", status }, "ajwad", "grocery");

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`/select-org?status=${status}`);
    }
  });

  it("does not let an org status escape into the URL", () => {
    // The status is a database enum today. It is interpolated into a header, so
    // a value that ever stopped being one must not be able to add a second query
    // parameter — the classic `?status=ok&next=https://evil` injection.
    const res = respondToScopeProblem(
      { kind: "inactive", status: "suspended&next=https://evil.example" },
      "ajwad",
      "grocery",
    );
    const location = res.headers.get("location") ?? "";

    expect(location.startsWith("/select-org?")).toBe(true);
    // The `&` and `=` are percent-encoded, so the value stays one parameter.
    const params = new URLSearchParams(location.slice("/select-org?".length));
    expect([...params.keys()]).toEqual(["status"]);
    expect(params.get("status")).toBe("suspended&next=https://evil.example");
    expect(params.get("next")).toBeNull();
  });

  it("never lets a 307 be cached", () => {
    // The answer depends on who is asking — a signed-out visitor and a member
    // of a suspended org get different ones — so a shared cache must not keep it.
    for (const problem of [
      { kind: "unauthenticated" },
      { kind: "inactive", status: "suspended" },
    ] as const) {
      const res = respondToScopeProblem(problem, "ajwad", "grocery");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answers an unknown or forbidden org with a bare 404 and no cache", () => {
    // "No such org" and "not your org" must stay indistinguishable, and the 404
    // must not be cached — otherwise one visitor's negative answer is replayed
    // to the next one.
    const res = respondToScopeProblem({ kind: "not-found" }, "ajwad", "grocery");

    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses an org or system segment that would climb out of the path", () => {
    // `orgSystemPath` validates both segments before they reach a URL. A
    // traversal here would send the redirect — and the `next` it carries — to a
    // path outside the origin.
    for (const [org, system] of [
      ["../evil", "grocery"],
      ["ajwad/../../etc", "grocery"],
      ["ajwad", "../../../etc/passwd"],
      ["aj wad", "grocery"],
    ] as const) {
      expect(() => respondToScopeProblem({ kind: "unauthenticated" }, org, system)).toThrow();
    }
  });
});
