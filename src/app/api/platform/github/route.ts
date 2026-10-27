import { enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { githubConfig, missingGithubEnv } from "@/core/github/auth";
import { githubInstallUrl, listInstallations } from "@/core/github/client";
import { listGithubSystems, recordInstallation } from "@/core/github/service";
import { prisma } from "@/core/db/client";

/**
 * GET /api/platform/github — connection state for the deployment dashboard.
 *
 * Reads the DB only (never calls GitHub), so the dashboard renders when GitHub
 * is unreachable. `POST` syncs the App's installations from GitHub and returns
 * the same shape, which is what the "Connect organization" button calls after
 * the user installs the App.
 */
async function dashboardPayload() {
  const config = githubConfig();
  const systems = await listGithubSystems();
  const installations = await prisma.githubInstallation.findMany({ orderBy: { createdAt: "desc" } });
  return {
    configured: Boolean(config),
    missingEnv: missingGithubEnv(),
    installUrl: githubInstallUrl(),
    org: config?.org ?? null,
    installations: installations.map((row) => ({
      id: row.id,
      accountLogin: row.accountLogin,
      accountType: row.accountType,
      repositorySelection: row.repositorySelection,
      suspended: row.suspended,
    })),
    systems,
  };
}

export const GET = withRoute("platform.github.status", async (request) => {
  enforceRateLimit(request, "platform:github", 30, 60_000);
  await requirePlatformAdmin(request);
  return ok(await dashboardPayload());
});

export const POST = withRoute("platform.github.sync", async (request) => {
  enforceRateLimit(request, "platform:github:sync", 30, 60_000);
  await requirePlatformAdmin(request);
  if (!githubConfig()) {
    return ok(await dashboardPayload());
  }
  const installations = await listInstallations();
  for (const installation of installations) {
    await recordInstallation(installation);
  }
  return ok(await dashboardPayload());
});
