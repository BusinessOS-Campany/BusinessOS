import "../src/core/config/load-env";
import { auth } from "../src/core/auth/server";
import { prisma } from "../src/core/db/client";
import { logger } from "../src/core/logging/logger";
import { GroceryAdapter } from "../src/core/apps/adapters/grocery";
import { SamaCenterAdapter } from "../src/core/apps/adapters/sama-center";
import { sanitizeAiTools, sanitizeConfigurationSchema } from "../src/core/apps/service";

const DEFAULT_PLANS = [
  {
    code: "trial",
    nameAr: "تجريبي",
    nameEn: "Trial",
    priceMonthlyMinor: BigInt(0),
    limits: { users: 2, branches: 1, aiCreditsPerMonth: 0 },
    sortOrder: 0,
  },
  {
    code: "basic",
    nameAr: "الأساسية",
    nameEn: "Basic",
    priceMonthlyMinor: BigInt(9900),
    limits: { users: 5, branches: 1, aiCreditsPerMonth: 100 },
    sortOrder: 1,
  },
  {
    code: "pro",
    nameAr: "الاحترافية",
    nameEn: "Pro",
    priceMonthlyMinor: BigInt(24900),
    limits: { users: 25, branches: 5, aiCreditsPerMonth: 1000 },
    sortOrder: 2,
  },
  {
    code: "enterprise",
    nameAr: "المؤسسية",
    nameEn: "Enterprise",
    priceMonthlyMinor: BigInt(99900),
    limits: { users: -1, branches: -1, aiCreditsPerMonth: 10000 },
    sortOrder: 3,
  },
];

async function seedPlans() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: { limits: plan.limits as never, priceMonthlyMinor: plan.priceMonthlyMinor },
      create: plan,
    });
  }
  logger.info("[seed] plans upserted");
}

async function seedPlatformAdmin() {
  const email = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error("[seed] SEED_PLATFORM_ADMIN_EMAIL / SEED_PLATFORM_ADMIN_PASSWORD missing or weak");
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await auth.api.signUpEmail({ body: { email, password, name: "Platform Admin" } });
      logger.info({ email }, "[seed] platform admin created");
    }
    // Platform realm role (Better Auth admin plugin).
    await prisma.user.update({ where: { email }, data: { role: "admin" } });
    logger.info({ email }, "[seed] platform admin role=admin ensured");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already/i.test(message)) {
      logger.warn({ email }, "[seed] platform admin already exists — skipping signup");
    } else {
      throw err;
    }
  }
}

async function seedApps() {
  const adapters = [new GroceryAdapter(), new SamaCenterAdapter()];

  for (const adapter of adapters) {
    const meta = adapter.getMetadata();
    await prisma.app.upsert({
      where: { slug: meta.slug },
      create: {
        slug: meta.slug,
        name: meta.name,
        nameAr: meta.nameAr,
        description: meta.description,
        descriptionAr: meta.descriptionAr,
        icon: meta.icon,
        category: meta.category,
        version: meta.version,
        routePrefix: meta.routePrefix,
        capabilities: meta.capabilities as any,
        permissions: meta.permissions as any,
        navigation: meta.navigation as any,
        configurationSchema: sanitizeConfigurationSchema(meta.configurationSchema),
        dashboardWidgets: meta.dashboardWidgets as any ?? undefined,
        aiTools: sanitizeAiTools(meta.aiTools),
      },
      update: {
        name: meta.name,
        nameAr: meta.nameAr,
        description: meta.description,
        descriptionAr: meta.descriptionAr,
        icon: meta.icon,
        version: meta.version,
        capabilities: meta.capabilities as any,
        permissions: meta.permissions as any,
        navigation: meta.navigation as any,
      },
    });
    logger.info({ slug: meta.slug }, "[seed] app registered");
  }
}

async function main() {
  await seedPlans();
  await seedPlatformAdmin();
  await seedApps();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "[seed] failed");
    process.exit(1);
  });
