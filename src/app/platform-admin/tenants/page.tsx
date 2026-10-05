import { prisma } from "@/core/db/client";
import { readAllVaultFileStatus } from "@/core/org-vault/status";
import { TenantActions, TenantRowActions } from "./tenant-actions";

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default async function TenantsPage() {
  const tenants = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      templateCode: true,
      createdAt: true,
      plan: { select: { code: true, nameEn: true } },
      members: { where: { role: "owner" }, select: { userId: true }, take: 1 },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Folder-only, so the list costs no database queries per org: the per-org
  // schema state is on the detail page, where one read is affordable.
  const vaults = readAllVaultFileStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Tenants</h1>
      </div>

      <TenantActions />

      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Slug</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Template</th>
              <th className="px-4 py-2 font-medium">Members</th>
              <th className="px-4 py-2 font-medium">SQL file</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {tenants.map((t) => {
              const vault = vaults[t.slug];
              return (
                <tr key={t.id} className="bg-neutral-950">
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        t.status === "active"
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          : "rounded-full bg-red-900/60 px-2 py-0.5 text-xs text-red-300"
                      }
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{t.plan?.nameEn ?? "—"}</td>
                  <td className="px-4 py-2">{t.templateCode ?? "—"}</td>
                  <td className="px-4 py-2">{t._count.members}</td>
                  <td className="px-4 py-2 text-xs text-neutral-400">
                    {!vault ? (
                      <span className="text-neutral-600">no folder</span>
                    ) : !vault.sqlExists ? (
                      <span className="text-amber-400">never exported</span>
                    ) : (
                      <>
                        {human(vault.sqlBytes)}
                        <span className="block text-[11px] text-neutral-600">
                          {vault.sqlExportedAt ? new Date(vault.sqlExportedAt).toLocaleString() : "unknown"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <TenantRowActions
                      tenantId={t.id}
                      status={t.status}
                      ownerUserId={t.members[0]?.userId ?? null}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
