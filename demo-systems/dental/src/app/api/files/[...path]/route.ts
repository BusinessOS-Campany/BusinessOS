import { requireAuth } from "@/lib/dal"
import { readStoredFile, mimeFromExt } from "@/lib/storage"

interface RouteCtx {
  params: Promise<{ path: string[] }>
}

export async function GET(_req: Request, ctx: RouteCtx) {
  await requireAuth()
  const { path } = await ctx.params
  const rel = path.join("/")
  const buf = await readStoredFile(rel)
  if (!buf) return new Response("Not found", { status: 404 })
  const mime = mimeFromExt(rel)
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, max-age=86400",
    },
  })
}