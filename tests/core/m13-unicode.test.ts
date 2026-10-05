import "@/core/config/load-env";
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/core/db/client";

/**
 * Arabic/Unicode regression guard.
 *
 * 1. Static: cp-1256 mojibake markers must NOT appear in source files.
 *    (The corruption family was: UTF-8 Arabic bytes re-interpreted as the
 *    Windows-1256 codepage and saved back as UTF-8 — e.g. "طھظ… ط§ظ„ط­ظپط¸"
 *    for "تم الحفظ".)
 * 2. DB: Arabic must survive create/read/update/delete byte-for-byte.
 */

const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "public", ".data", "src/core/db/generated"]);

const ROOTS = [join(__dirname, "..", "..", "src"), join(__dirname, "..", "..", "prisma")];

// High-precision markers for the cp-1256 mojibake family.
//  - U+FFFD replacement char (invalid UTF-8 anywhere)
const FFFD = /\uFFFD/;
//  - an Arabic letter directly followed by a Latin-1/General-Punctuation symbol
//    that never legitimately follows Arabic in this codebase (» « … — — and
//    ®/© footnotes are legitimate and excluded).
const COMBO =
  /[\u0600-\u06FF][\u00A2\u00A4\u00A7\u00AA\u00AC\u00AD\u00AF\u00B1\u00B2\u00B3\u00B4\u00B6\u00B8\u00D7\u00F7\u201E\u2020\u2021\u2030\u2022\u2122\u20AC]|[\u00A2\u00A4\u00A7\u00AA\u00AC\u00AD\u00AF\u00B1\u00B2\u00B3\u00B4\u00B6\u00B8\u00D7\u00F7\u201E\u2020\u2021\u2030\u2022\u2122\u20AC][\u0600-\u06FF]/;
//  - Persian/Urdu-only letters that cp-1256 continuation bytes produce
const PERSIAN = /[\u0679-\u068F\u0698\u06A9\u06AF\u06BE\u06CC\u06D2]/;

const PROFILE_PATH = join(__dirname, "..", "..", "src", "components", "profile", "profile-form.tsx");

const SAMPLE_NAMES = [
  "الملف الشخصي",
  "شركة الأعمال الحديثة",
  "محمد أحمد",
  "مركز سما الطبي",
  "وصف باللغة العربية",
  "صنعاء",
  "إب",
  "اليمن",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mts|cts|json|sql)$/.test(name)) out.push(full);
  }
  return out;
}

describe("unicode / arabic encoding", () => {
  it("source files contain no cp-1256 mojibake markers", () => {
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (FFFD.test(text)) throw new Error(`${file}: contains U+FFFD`);
        if (COMBO.test(text)) throw new Error(`${file}: Arabic/symbol mojibake combo`);
        if (PERSIAN.test(text)) throw new Error(`${file}: Persian/Urdu mojibake letters`);
      }
    }
  });

  it("profile form source carries the correct Arabic strings", () => {
    const src = readFileSync(PROFILE_PATH, "utf8");
    for (const expected of ["تم الحفظ", "البيانات الشخصية", "الجلسات النشطة", "الاسم", "الوصف", "الهاتف", "اللغة"]) {
      expect(src).toContain(expected);
    }
  });

  it("sample Arabic strings round-trip through the database unchanged", async () => {
    const orgId = randomUUID();
    const slug = `ar-${randomUUID().slice(0, 12)}`;
    const userId = randomUUID();
    const email = `bio-${randomUUID().slice(0, 12)}@arabic.test`;
    try {
      const created = await prisma.organization.create({
        data: { id: orgId, name: "شركة الأعمال الحديثة", slug },
      });
      expect(created.name).toBe("شركة الأعمال الحديثة");

      const read = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(read?.name).toBe("شركة الأعمال الحديثة");

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: { name: "مركز سما الطبي" },
      });
      expect(updated.name).toBe("مركز سما الطبي");

      const mixed = "Business OS - نظام إدارة الأعمال";
      await prisma.organization.update({ where: { id: orgId }, data: { name: mixed } });
      const readMixed = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(readMixed?.name).toBe(mixed);

      const user = await prisma.user.create({
        data: {
          id: userId,
          name: "محمد أحمد",
          email,
          bio: "وصف باللغة العربية",
          locale: "ar",
        },
      });
      expect(user.bio).toBe("وصف باللغة العربية");

      await prisma.user.update({ where: { id: userId }, data: { bio: "صنعاء، اليمن" } });
      const readUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(readUser?.bio).toBe("صنعاء، اليمن");
      expect(readUser?.name).toBe("محمد أحمد");
    } finally {
      try {
        await prisma.organization.delete({ where: { id: orgId } });
      } catch {
        /* already gone */
      }
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch {
        /* already gone */
      }
    }
  });

  it("every reference Arabic sample string is unchanged (bigram sanity)", () => {
    for (const s of SAMPLE_NAMES) expect(s.normalize("NFC")).toBe(s);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});