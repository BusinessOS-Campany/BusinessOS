import path from "node:path"

/**
 * The mesh the 3D dental chart draws, and nothing else.
 *
 * The chart used to request it with a root-absolute `/model/human_teeth.glb`,
 * which cannot work here: neither the demo (`/demo/dental`) nor an org's copy
 * (`/<org>/dental`) is mounted at the origin, so that URL addresses the
 * platform rather than this app and 404s. It is served by
 * `app/model/[...path]/route.ts` instead, which streams it off disk and cannot
 * fall behind a basePath it does not know about.
 *
 * Allowlist rather than denylist: a request is either the one filename the chart
 * loads or it is not served, so `..`, percent-encoded traversal, absolute paths
 * and nested paths are all unreachable by construction rather than filtered.
 */
const ALLOWED = new Map<string, string>([["human_teeth.glb", "model/gltf-binary"]])

export interface ResolvedModelAsset {
  file: string
  contentType: string
}

/**
 * Maps a `/model/...` request path to a file on disk, or `null` when the request
 * is not the one mesh this app serves.
 */
export function resolveModelAsset(
  modelDir: string,
  requested: readonly string[],
): ResolvedModelAsset | null {
  if (requested.length !== 1) return null
  const name = requested[0]
  const contentType = ALLOWED.get(name)
  if (!contentType) return null
  // Safe to join: `name` came from the allowlist, so it carries no separators.
  return { file: path.join(modelDir, name), contentType }
}