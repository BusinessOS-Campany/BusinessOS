import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModelAsset } from "../../system/dental/src/lib/model-asset";

// Why the 3D chart never drew anything in the demo or in an org's copy.
//
// `dental-chart-3d.tsx` asked for the mesh with a root-absolute URL,
// `"/model/human_teeth.glb"`, and `useGLTF` fetches that string verbatim. The
// file itself is fine: present in `public/model/` in all three trees, 1,547,688
// bytes, byte-identical (md5 B7CCF29FDBCC), and tracked since the initial
// commit.
//
// The URL is the problem. Neither app is mounted at the origin. An org's copy is
// served at `/<org>/dental` (the supervisor hands the child `SYSTEM_BASE_PATH`,
// which its `next.config.ts` feeds to `basePath`), and the demo serves itself at
// `/demo/dental`. So the browser asked the *platform* for `/model/human_teeth.glb`,
// which is not the Dental app at all. Measured: `/model/human_teeth.glb` -> 404
// and `/demo/dental/model/human_teeth.glb` -> 404, while a sibling
// `/demo/dental/file.svg` -> 200. `GLTFLoader` then failed and the component's
// own error boundary rendered "3D model not available".
//
// A root-absolute URL is also the one thing `next/link` cannot rescue: the
// `next.config.ts` comment in this app already warns that a raw fetch has to be
// written mount-relative. So the mesh is now served by a route handler (which
// cannot 404 behind a basePath it does not know about) and the client resolves
// the URL through `useHref`, which is the supported way to get it basePath-
// correct for whichever mount the app happens to be running at.
//
// The resolver is exact-match allowlist by construction: a request is either the
// one filename the chart loads, or it is not served at all. That is what makes
// traversal unreachable rather than merely filtered.

const DIR = path.join(path.sep, "srv", "dental", "public", "model");

describe("resolving the 3D chart's model asset", () => {
  it("resolves the one mesh the chart loads, typed as binary glTF", () => {
    expect(resolveModelAsset(DIR, ["human_teeth.glb"])).toEqual({
      file: path.join(DIR, "human_teeth.glb"),
      contentType: "model/gltf-binary",
    });
  });

  it("refuses a path that climbs out of public/model", () => {
    expect(resolveModelAsset(DIR, ["..", "..", ".env.local"])).toBeNull();
    expect(resolveModelAsset(DIR, ["..", "..", "..", "etc", "passwd"])).toBeNull();
  });

  it("refuses a traversal that is still percent-encoded", () => {
    expect(resolveModelAsset(DIR, ["..%2f..%2f.env.local"])).toBeNull();
    expect(resolveModelAsset(DIR, ["%2e%2e%2f%2e%2e%2f.env.local"])).toBeNull();
  });

  it("refuses an absolute path", () => {
    expect(resolveModelAsset(DIR, ["/etc/passwd"])).toBeNull();
    expect(resolveModelAsset(DIR, ["C:\\Windows\\win.ini"])).toBeNull();
  });

  it("refuses a nested path, so the allowlist stays one file deep", () => {
    expect(resolveModelAsset(DIR, ["sub", "human_teeth.glb"])).toBeNull();
  });

  it("refuses any other file instead of serving arbitrary bytes", () => {
    expect(resolveModelAsset(DIR, ["a_windy_day.glb"])).toBeNull();
    expect(resolveModelAsset(DIR, ["anything.txt"])).toBeNull();
  });

  it("refuses an empty request", () => {
    expect(resolveModelAsset(DIR, [])).toBeNull();
  });
});