import { createReadStream, statSync } from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import { resolveModelAsset } from "@/lib/model-asset"

/**
 * Serves the 3D dental chart's mesh.
 *
 * The chart asked for this file with a root-absolute `/model/human_teeth.glb`,
 * but neither the demo (`/demo/dental`) nor an org's copy (`/<org>/dental`) is
 * mounted at the origin, so that URL addressed the platform and 404'd. Reading
 * the bytes here instead means the app can only ever be asked for its own
 * asset, which cannot fall behind a basePath this handler does not know about.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: requested } = await ctx.params
  const asset = resolveModelAsset(path.join(process.cwd(), "public", "model"), requested)
  if (!asset) return new Response("Not found", { status: 404 })

  let size: number
  try {
    size = statSync(asset.file).size
  } catch {
    return new Response("Not found", { status: 404 })
  }

  const stream = Readable.toWeb(createReadStream(asset.file)) as ReadableStream<Uint8Array>
  return new Response(stream, {
    headers: {
      "content-type": asset.contentType,
      "content-length": String(size),
      // The filename is content-addressed by a release, and an org's copy is
      // rebuilt from the same template, so a long cache is safe and keeps a
      // 1.5 MB mesh off every subsequent 3D visit.
      "cache-control": "public, max-age=86400, immutable",
    },
  })
}