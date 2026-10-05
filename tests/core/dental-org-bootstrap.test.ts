import { describe, expect, it } from "vitest";
import { ensureOrgStructure } from "../../system/dental/prisma/org-structure";

// The `/patients` 500 in an approved org's Dental copy, and why the demo hid it.
//
// `lib/actions/patients.ts` resolves its clinic as
// `user.clinicId ?? (await prisma.clinic.findFirstOrThrow()).id`, and three more
// call sites do the same for `branch`. `dal.ts` only fills `clinicId` from
// `user.branch?.clinicId`, and `api/bos/link` provisions a platform user with
// `branchId: null`. So on a freshly cloned org database the fallback is the only
// path to a clinic — and a database that has been through `prisma migrate deploy`
// plus a roles-only bootstrap has NO clinic row at all, so `findFirstOrThrow`
// throws P2025 and the page is a 500.
//
// The demo could never show this: `prisma/seed.ts` creates a clinic and three
// branches, and its admin holds a `branchId`, so `dal.ts` resolves `clinicId`
// directly and the fallback never runs.
//
// Migrations create tables; the bootstrap is the layer that is supposed to add
// "the minimum catalog an organization needs before it can record anything"
// (`supervisor.ts:608-620`). Dental's bootstrap only ever added the ten roles.
//
// Fails-first: a database with neither row leaves every one of those four
// call sites throwing, and the org cannot record anything at all.

type ClinicRow = { id: string; name: string; nameAr: string | null };
type BranchRow = { id: string; clinicId: string; name: string; nameAr: string | null };

/** Minimal stand-in for the Prisma client the bootstrap touches. */
function fakePrisma(clinics: ClinicRow[] = [], branches: BranchRow[] = []) {
  const state = { clinics: [...clinics], branches: [...branches] };
  let seq = 0;
  const client = {
    state,
    clinic: {
      async findFirst() {
        return state.clinics[0] ?? null;
      },
      async create({ data }: { data: Omit<ClinicRow, "id"> }) {
        const row = { id: `clinic_${++seq}`, ...data };
        state.clinics.push(row);
        return row;
      },
    },
    branch: {
      async findFirst({ where }: { where: { clinicId: string } }) {
        return state.branches.find((b) => b.clinicId === where.clinicId) ?? null;
      },
      async create({ data }: { data: Omit<BranchRow, "id"> }) {
        const row = { id: `branch_${++seq}`, ...data };
        state.branches.push(row);
        return row;
      },
    },
  };
  return client;
}

describe("dental per-org bootstrap provisions a clinic and a branch", () => {
  it("creates the clinic row that the patients fallback requires", async () => {
    const prisma = fakePrisma();

    const result = await ensureOrgStructure(prisma);

    expect(prisma.state.clinics).toHaveLength(1);
    expect(prisma.state.clinics[0].name).toBeTruthy();
    expect(result.clinicCreated).toBe(true);
  });

  it("creates a branch owned by that clinic, for the three branch fallbacks", async () => {
    const prisma = fakePrisma();

    const result = await ensureOrgStructure(prisma);

    expect(prisma.state.branches).toHaveLength(1);
    expect(prisma.state.branches[0].clinicId).toBe(prisma.state.clinics[0].id);
    expect(result.branchCreated).toBe(true);
  });

  it("names both rows bilingually, because the app defaults to Arabic", async () => {
    const prisma = fakePrisma();

    await ensureOrgStructure(prisma);

    expect(prisma.state.clinics[0].nameAr).toBeTruthy();
    expect(prisma.state.branches[0].nameAr).toBeTruthy();
  });

  it("is idempotent: a second run adds nothing", async () => {
    const prisma = fakePrisma();

    await ensureOrgStructure(prisma);
    const second = await ensureOrgStructure(prisma);

    expect(prisma.state.clinics).toHaveLength(1);
    expect(prisma.state.branches).toHaveLength(1);
    expect(second.clinicCreated).toBe(false);
    expect(second.branchCreated).toBe(false);
  });

  it("leaves an org's own clinic and branch untouched", async () => {
    const prisma = fakePrisma(
      [{ id: "org_clinic", name: "Her Own Clinic", nameAr: null }],
      [{ id: "org_branch", clinicId: "org_clinic", name: "Her Own Branch", nameAr: null }],
    );

    await ensureOrgStructure(prisma);

    expect(prisma.state.clinics).toHaveLength(1);
    expect(prisma.state.clinics[0].name).toBe("Her Own Clinic");
    expect(prisma.state.branches).toHaveLength(1);
    expect(prisma.state.branches[0].name).toBe("Her Own Branch");
  });

  it("fills only the missing half when an org has a clinic but no branch", async () => {
    const prisma = fakePrisma([{ id: "org_clinic", name: "Her Own Clinic", nameAr: null }]);

    const result = await ensureOrgStructure(prisma);

    expect(result.clinicCreated).toBe(false);
    expect(result.branchCreated).toBe(true);
    expect(prisma.state.clinics).toHaveLength(1);
    expect(prisma.state.branches[0].clinicId).toBe("org_clinic");
  });
});