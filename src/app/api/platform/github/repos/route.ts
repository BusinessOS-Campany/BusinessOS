import { ApiError, enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { assertSafeRepoFullName } from "@/core/github/sources";
import { getRepo, listBranches, listRepos } from "@/core/github/client";

/**
 * GET /api/platform/github/repos?installationId=…
 * GET /api/platform/github/repos?installationId=…&repo=owner/name (branches)
 *
 * Repository and branch browsing for the import dialog. Both values GitHub is
 * asked about are shape-validated before they reach an API path, so a crafted
 * `repo` cannot traverse the GitHub URL.
 */
export const GET = withRoute("platform.github.repos", async (request) => {
  enforceRateLimit(request, "platform:github:repos", 60, 60_000);
  await requirePlatformAdmin(request);
  const url = new URL(request.url);
  const installationId = Number(url.searchParams.get("installationId"));
  if (!Number.isInteger(installationId) || installationId <= 0) {
    throw ApiError.badRequest("installationId is required");
  }

  const repo = url.searchParams.get("repo");
  if (repo) {
    const [owner, name] = repo.split("/");
    if (!owner || !name) throw ApiError.badRequest("repo must be owner/name");
    assertSafeRepoFullName(repo);
    const meta = await getRepo(installationId, owner, name);
    if (!meta) throw ApiError.notFound(`Repository ${repo} is not accessible to this installation`);
    const branches = await listBranches(installationId, owner, name);
    return ok({ repo: meta, branches });
  }

  return ok({ repos: await listRepos(installationId) });
});
