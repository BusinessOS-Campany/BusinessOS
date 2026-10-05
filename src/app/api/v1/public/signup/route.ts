import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { getTemplate } from "@/core/platform/templates/grocery";
import { prisma } from "@/core/db/client";
import { auth } from "@/core/auth/server";
import { writeAuditLog } from "@/core/audit/service";
import { internalAuthEmail, isInternalAuthEmail, resolveIdentifier } from "@/core/auth/identifier";
import { ensureUniqueOrgSlug, slugifyOrgName } from "@/core/tenancy/org-slug";
import { onOrganizationCreated } from "@/core/org-vault/on-create";
import { storeCredentialsForUser } from "@/core/systems/credentials";

/** Maps template codes to app slugs that should be auto-installed. */
const TEMPLATE_APP_MAP: Record<string, string> = {
  grocery: "grocery",
  clinic: "sama-center",
};

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  /** Email address OR phone number — see `resolveIdentifier`. */
  identifier: z.string().min(3).max(120),
  /** ISO code, required when `identifier` is a phone number. */
  countryCode: z.string().max(2).nullish(),
  password: z.string().min(8).max(128),
  organizationName: z.string().min(2).max(80),
  templateCode: z.string().nullable().optional(),
});

export const POST = withRoute("public.signup", async (request) => {
  const body = signupSchema.parse(await request.json().catch(() => null));

  const template = getTemplate(body.templateCode);

  const resolved = resolveIdentifier(body.identifier, body.countryCode);
  if ("error" in resolved) {
    if (resolved.error === "empty") throw ApiError.badRequest("Identifier is required");
    throw ApiError.badRequest(
      body.countryCode
        ? "Invalid phone number for the selected country"
        : "Enter a valid email address or phone number",
    );
  }

  // better-auth identifies accounts by email and this build has no phone
  // plugin, so a phone registration is given a deterministic internal address.
  // It is never returned to the client and never mailed.
  const authEmail = resolved.kind === "email" ? resolved.email! : internalAuthEmail(resolved.phone!, resolved.countryCode);

  // Both columns are independently unique, so each has to be checked
  // separately: an existing phone must not be able to register a fresh email,
  // and vice versa.
  const identifierClash = await prisma.user.findFirst({
    where: {
      OR: [
        { email: authEmail },
        ...(resolved.kind === "phone" ? [{ phone: resolved.phone! }] : []),
      ],
    },
    select: { email: true, phone: true },
  });
  if (identifierClash) {
    throw ApiError.conflict(
      resolved.kind === "phone" ? "Phone number already registered" : "Email already registered",
    );
  }

  // Same helper the social path uses. An Arabic org name yields no ASCII, and
  // a slug like "مؤسسة-تجارية" is unroutable: the /{org} segment would never
  // match and the tenant the user just created would 404 on its own URL.
  const baseSlug = slugifyOrgName(body.organizationName, { seed: authEmail.split("@")[0] });
  const finalSlug = await ensureUniqueOrgSlug(
    (slug) => prisma.organization.findFirst({ where: { slug }, select: { id: true } }),
    baseSlug,
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      const signupResult = await auth.api.signUpEmail({
        body: { email: authEmail, password: body.password, name: body.name },
      });

      const userId = signupResult.user.id;

      // signUpEmail cannot write phone/countryCode, so they are set here. For an
      // email signup this is a no-op update of the two null columns.
      const profile =
        resolved.kind === "phone"
          ? await tx.user.update({
              where: { id: userId },
              data: { phone: resolved.phone!, countryCode: resolved.countryCode },
            })
          : null;

      const org = await tx.organization.create({
        data: {
          id: randomUUID(),
          name: body.organizationName,
          slug: finalSlug,
          status: "active",
          templateCode: template?.code ?? null,
          settings: template
            ? ({ ...template.settings, modulesEnabled: template.modules } as never)
            : { modulesEnabled: [] },
        },
      });

      await tx.member.create({
        data: { id: randomUUID(), organizationId: org.id, userId, role: "owner" },
      });

      // Auto-install the matching app for this template
      const appSlug = template ? TEMPLATE_APP_MAP[template.code] : undefined;
      if (appSlug) {
        const app = await tx.app.findUnique({ where: { slug: appSlug } });
        if (app) {
          await tx.organizationApp.create({
            data: {
              id: randomUUID(),
              organizationId: org.id,
              appId: app.id,
              status: "active",
              version: app.version,
              activatedAt: new Date(),
            },
          });
        }
      }

      await writeAuditLog(tx, { organizationId: org.id, userId }, {
        action: "platform.tenant.created",
        entityType: "organization",
        entityId: org.id,
        after: {
          name: org.name,
          slug: org.slug,
          planCode: "trial",
          // the real identifier, never the internal stand-in
          ownerIdentifier: resolved.kind === "phone" ? resolved.phone : resolved.email,
          ownerIdentifierKind: resolved.kind,
          ownerCountryCode: resolved.countryCode,
          templateCode: template?.code ?? null,
          installedApp: appSlug ?? null,
        },
      });

      return {
        user: {
          id: userId,
          kind: resolved.kind,
          email: resolved.kind === "email" ? resolved.email : null,
          phone: profile?.phone ?? null,
          countryCode: profile?.countryCode ?? null,
        },
        org: { id: org.id, name: org.name, slug: finalSlug },
      };
    });

    // Guard the contract: an internal stand-in must never leave the server.
    if (isInternalAuthEmail(authEmail) && result.user.email) {
      throw new Error("internal auth email leaked into the signup response");
    }

    // The org now exists, so it gets its folder under `orginazition/`. Runs
    // after the transaction commits and before the response returns, so a
    // successful 201 always means the folder exists. `initdb` is queued.
    await onOrganizationCreated(result.org);

    // The only other moment the platform holds the plaintext: it writes a bcrypt
    // digest of the same password for each (org, app) this new owner is a member
    // of, so they can type one email and one password on the platform and inside
    // the org's own copy of its system. A social signup never reaches here, so
    // there is no password to mirror and that member keeps gateway access.
    const mirrored = await storeCredentialsForUser(result.user.id, body.password);

    return ok({ ...result, systemCredentials: mirrored }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && /already/i.test(err.message)) {
      throw ApiError.conflict("Email already registered");
    }
    throw err;
  }
});
