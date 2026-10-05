import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { consumeConfirmToken } from "@/core/ai/confirm";
import { prisma } from "@/core/db/client";

const confirmSchema = z.object({
  confirmToken: z.string().min(1),
});

export const POST = withRoute("v1.ai.confirm", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "ai");
  requirePermission(tenant, { ai: ["use"] });
  const body = confirmSchema.parse(await request.json().catch(() => null));

  const action = await consumeConfirmToken(prisma, tenant, body.confirmToken);

  // Execute the mutating action
  switch (action.actionType) {
    case "create_customer": {
      const args = action.actionArgs as { name: string; phone?: string; email?: string; creditLimit?: number };
      const customer = await prisma.customer.create({
        data: {
          organizationId: tenant.organizationId,
          name: args.name,
          phone: args.phone,
          email: args.email,
          creditLimit: BigInt(args.creditLimit ?? 0),
        },
        select: { id: true, name: true },
      });
      return ok({ executed: true, result: customer });
    }
    case "create_product": {
      const args = action.actionArgs as { nameAr: string; nameEn?: string; sku: string; salePrice: number; costPrice?: number; categoryId?: string };
      const product = await prisma.product.create({
        data: {
          organizationId: tenant.organizationId,
          nameAr: args.nameAr,
          nameEn: args.nameEn,
          sku: args.sku,
          salePrice: BigInt(args.salePrice),
          costPrice: BigInt(args.costPrice ?? 0),
          categoryId: args.categoryId,
        },
        select: { id: true, nameAr: true, sku: true },
      });
      return ok({ executed: true, result: product });
    }
    case "create_expense": {
      const args = action.actionArgs as { amount: number; note: string; categoryId?: string; cashAccountId?: string };
      const expense = await prisma.expense.create({
        data: {
          organizationId: tenant.organizationId,
          amount: BigInt(args.amount),
          note: args.note,
          categoryId: args.categoryId,
          cashAccountId: args.cashAccountId,
          createdByUserId: tenant.userId,
          spentAt: new Date(),
        },
        select: { id: true, note: true, amount: true },
      });
      return ok({ executed: true, result: expense });
    }
    case "create_sale_draft": {
      // Return the draft for manual completion — AI never finalizes sales
      return ok({ executed: true, result: { draft: true, ...action.actionArgs } });
    }
    default:
      return ok({ executed: false, error: `Unknown action: ${action.actionType}` });
  }
});
