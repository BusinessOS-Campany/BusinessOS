// The per-organization structure a Dental install needs before it can record
// anything. Extracted from `bootstrap.ts` so it can be exercised without a
// database.
//
// Why this exists: four call sites resolve their tenant through a fallback that
// assumes the row is already there —
//   lib/actions/patients.ts     `user.clinicId  ?? clinic.findFirstOrThrow()`
//   lib/actions/appointments.ts `user.branchId  ?? branch.findFirstOrThrow()`
//   lib/actions/waiting-room.ts `user.branchId  ?? branch.findFirstOrThrow()`
//   app/(app)/waiting-room/page `user.branchId ?? branch.findFirstOrThrow()`
// `dal.ts` only derives `clinicId` from `user.branch?.clinicId`, and
// `api/bos/link` provisions a platform user with `branchId: null`, so on a fresh
// org database those fallbacks are the ONLY route to a clinic and branch. A
// migrated org database has tables but no rows, so the fallbacks threw P2025 and
// every one of those pages was a 500.
//
// `prisma/seed.ts` creates a clinic and branches, which is why the demo never
// showed this. Running a dev fixture in a customer's database is not the answer —
// that is what `bootstrap.ts` is explicitly not — so the org gets ONE neutral
// clinic and branch of its own, which its staff can then rename and extend.

export type OrgStructureResult = {
  clinicCreated: boolean;
  branchCreated: boolean;
};

/** The slice of the generated Prisma client this file touches. */
type ClinicBranchClient = {
  clinic: {
    findFirst(args?: unknown): Promise<{ id: string } | null>;
    create(args: { data: { name: string; nameAr: string } }): Promise<{ id: string }>;
  };
  branch: {
    findFirst(args: { where: { clinicId: string } }): Promise<{ id: string } | null>;
    create(args: { data: { clinicId: string; name: string; nameAr: string } }): Promise<{ id: string }>;
  };
};

/**
 * Ensures the database has at least one clinic and one branch belonging to it.
 *
 * Additive and idempotent: an org that already has either keeps its own rows and
 * this only fills in what is genuinely missing, so nothing is renamed or replaced
 * on a re-run. Bilingual names because the app's `defaultLanguage` is `ar`.
 */
export async function ensureOrgStructure(prisma: ClinicBranchClient): Promise<OrgStructureResult> {
  const existingClinic = await prisma.clinic.findFirst();

  const clinic = existingClinic
    ? existingClinic
    : await prisma.clinic.create({
        data: { name: "Main Clinic", nameAr: "العيادة الرئيسية" },
      });

  const existingBranch = await prisma.branch.findFirst({ where: { clinicId: clinic.id } });

  if (!existingBranch) {
    await prisma.branch.create({
      data: {
        clinicId: clinic.id,
        name: "Main Branch",
        nameAr: "الفرع الرئيسي",
      },
    });
  }

  return {
    clinicCreated: !existingClinic,
    branchCreated: !existingBranch,
  };
}