import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { orgVaultPaths } from "@/core/org-vault/paths";
import { getVaultEntry } from "@/core/org-vault/registry";

/**
 * Streams one org's `database/<folder>.sql` to the platform admin.
 *
 * The path is derived from the org's own vault entry, never from the request, so
 * there is no way to ask for a file outside `orginazition/`. Served as a
 * `Content-Disposition: attachment` so the browser saves it rather than trying to
 * render it, and read with a stream so a large dump is not buffered in memory.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  await requirePlatformAdmin(request);
  const { id } = await ctx.params;

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true },
  });
  if (!org) {
    return new Response(JSON.stringify({ error: { messageEn: "Tenant not found" } }), { status: 404 });
  }

  const entry = getVaultEntry(org.slug);
  if (!entry) {
    return new Response(
      JSON.stringify({ error: { messageEn: "This tenant has no vault folder yet" } }),
      { status: 404 },
    );
  }

  const file = orgVaultPaths(entry.folder).sqlFile;
  if (!existsSync(file)) {
    return new Response(
      JSON.stringify({ error: { messageEn: "This tenant has no SQL file yet" } }),
      { status: 404 },
    );
  }

  const stat = statSync(file);
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/sql; charset=utf-8",
      "content-length": String(stat.size),
      "content-disposition": `attachment; filename="${entry.folder}.sql"`,
      "cache-control": "no-store",
    },
  });
}
