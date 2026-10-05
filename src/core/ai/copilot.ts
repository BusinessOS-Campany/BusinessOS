import type { PrismaClient } from "@/core/db/generated/prisma/client";
import type { TenantRef } from "@/core/sales/service";
import { TOOL_REGISTRY, getToolByName } from "./tools";
import { executeReadTool } from "./executor";
import { createConfirmToken } from "./confirm";
import { assertAiQuota, logAiUsage } from "./metering";
import { callLLM, getActiveProvider, type ChatMessage, type ToolDef } from "./provider";
import { getOrgSettings } from "@/core/tenancy/settings";
import { z } from "zod";

export type ChatInput = { message: string; conversationId?: string };

/**
 * Process a copilot chat message. Grounded in business data via tool calls.
 * Returns assistant message + any pending mutating actions requiring confirmation.
 */
export async function chat(
  tx: PrismaClient,
  tenant: TenantRef,
  input: ChatInput,
) {
  // ── plan cap gate ──────────────────────────────────────────────────────
  const settings = await getOrgSettings(tenant.organizationId);
  const planId = (settings as Record<string, unknown>).planId as string | null;
  await assertAiQuota(tx, tenant.organizationId, planId);

  // ── build system context ───────────────────────────────────────────────
  const org = await tx.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { name: true, settings: true },
  });
  const systemContext = buildSystemContext(org?.name ?? "Business");

  // ── provider + tools ──────────────────────────────────────────────────
  const provider = await getActiveProvider(tx);
  const toolDefs: ToolDef[] = TOOL_REGISTRY.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.kind === "read" ? t.description : `${t.description} — returns pending_action`,
      parameters: zodToJsonSchema(t.argsSchema),
    },
  }));

  const messages: ChatMessage[] = [
    { role: "system", content: systemContext },
    { role: "user", content: input.message },
  ];

  // ── conversation loop (max 5 tool-call rounds) ────────────────────────
  let rounds = 0;
  const pendingActions: Array<{ actionType: string; args: Record<string, unknown>; confirmToken: string }> = [];

  while (rounds < 5) {
    const isMock = provider.name === "mock";
    const response = isMock
      ? generateMockResponse(input.message, messages)
      : await callLLM(provider, messages, toolDefs);

    // Log usage
    await logAiUsage(tx, {
      organizationId: tenant.organizationId,
      model: provider.model,
      tokensIn: response.usage.promptTokens,
      tokensOut: response.usage.completionTokens,
      costMicro: 0, // mock = free; real provider would calculate
      toolCalls: response.message.toolCalls?.length ?? 0,
      conversationId: input.conversationId,
      createdByUserId: tenant.userId,
    });

    // If no tool calls, return the assistant message
    if (!response.message.toolCalls?.length) {
      return {
        message: response.message.content,
        pendingActions,
        usage: response.usage,
      };
    }

    // Process tool calls
    messages.push(response.message);

    for (const tc of response.message.toolCalls) {
      const tool = getToolByName(tc.function.name);
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;

      if (!tool) {
        messages.push({
          role: "tool",
          content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}` }),
          toolCallId: tc.id,
        });
        continue;
      }

      if (tool.kind === "read") {
        try {
          const result = await executeReadTool(tx, tenant, tool.name, args);
          messages.push({
            role: "tool",
            content: JSON.stringify(result),
            toolCallId: tc.id,
          });
        } catch (err) {
          messages.push({
            role: "tool",
            content: JSON.stringify({ error: (err as Error).message }),
            toolCallId: tc.id,
          });
        }
      } else {
        // Mutating tool → create confirmation token, return pending_action
        const { confirmToken } = await createConfirmToken(tx, tenant, tool.name, args, tc.id);
        pendingActions.push({ actionType: tool.name, args, confirmToken });
        messages.push({
          role: "tool",
          content: JSON.stringify({ pending: true, confirmToken, message: `Action requires confirmation: ${tool.descriptionAr}` }),
          toolCallId: tc.id,
        });
      }
    }

    rounds++;
  }

  // Return whatever we have after max rounds
  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  return {
    message: lastAssistant?.content ?? "تم",
    pendingActions,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

function buildSystemContext(orgName: string): string {
  return `You are a helpful business assistant for "${orgName}". You can:
- Answer questions about sales, inventory, customers, and suppliers using real data tools.
- Help create customers, products, expenses, and sale drafts (with confirmation).
- Respond in Arabic when the user writes in Arabic, and English when they write in English.

Rules:
- Always use tools to get real data — never make up numbers.
- For sales questions, use get_sales_summary.
- For stock questions, use get_inventory.
- When creating records, always explain what you're about to do and the tool will require confirmation.
- Keep responses concise and helpful.
- Money is in SAR (Saudi Riyals) unless specified otherwise.
- Currency amounts are integers in minor units (fils).`;
}

function generateMockResponse(
  userMessage: string,
  messages: ChatMessage[],
): { message: ChatMessage; usage: { promptTokens: number; completionTokens: number; totalTokens: number } } {
  const lower = userMessage.toLowerCase();
  const isArabic = /[\u0600-\u06FF]/.test(userMessage);

  // Detect tool-calling intent from the conversation
  const lastToolResult = [...messages].reverse().find((m) => m.role === "tool");
  if (lastToolResult) {
    const data = JSON.parse(lastToolResult.content);
    if (data.totalRevenue !== undefined) {
      const revenue = data.totalRevenue;
      return {
        message: {
          role: "assistant",
          content: isArabic
            ? `إجمالي مبيعات الفترة هو ${revenue.toLocaleString()} ريال من ${data.invoiceCount} فاتورة.`
            : `Total sales for the period is ${revenue.toLocaleString()} SAR from ${data.invoiceCount} invoices.`,
        },
        usage: { promptTokens: 150, completionTokens: 30, totalTokens: 180 },
      };
    }
    if (Array.isArray(data) && data[0]?.name) {
      const names = data.slice(0, 5).map((p: Record<string, unknown>) => p.name).join(", ");
      return {
        message: { role: "assistant", content: isArabic ? `النتائج: ${names}` : `Results: ${names}` },
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      };
    }
    return {
      message: { role: "assistant", content: isArabic ? "تم." : "Done." },
      usage: { promptTokens: 80, completionTokens: 10, totalTokens: 90 },
    };
  }

  // First turn — decide which tool to call
  if (lower.includes("مبيعات") || lower.includes("sales") || lower.includes("revenue")) {
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: `tc-${Date.now()}`, type: "function", function: { name: "get_sales_summary", arguments: "{}" } }],
      },
      usage: { promptTokens: 200, completionTokens: 20, totalTokens: 220 },
    };
  }
  if (lower.includes("مخزون") || lower.includes("inventory") || lower.includes("stock")) {
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: `tc-${Date.now()}`, type: "function", function: { name: "get_inventory", arguments: '{"lowOnly":false}' } }],
      },
      usage: { promptTokens: 200, completionTokens: 20, totalTokens: 220 },
    };
  }
  if (lower.includes("عملاء") || lower.includes("customer") || lower.includes("دين")) {
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: `tc-${Date.now()}`, type: "function", function: { name: "get_debt", arguments: "{}" } }],
      },
      usage: { promptTokens: 200, completionTokens: 20, totalTokens: 220 },
    };
  }

  // Default greeting
  return {
    message: {
      role: "assistant",
      content: isArabic
        ? "مرحباً! أنا مساعدك التجاري. كيف يمكنني مساعدتك؟ يمكنني الإجابة عن أسئلة المبيعات والمخزون والعملاء."
        : "Hello! I'm your business assistant. How can I help? I can answer questions about sales, inventory, and customers.",
    },
    usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
  };
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { type: string; shape?: Record<string, z.ZodTypeAny> };
  if (def.type === "object" && def.shape) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(def.shape)) {
      const inner = val._def as { type: string };
      const isOpt = inner.type === "optional";
      const baseType = isOpt ? (val._def as unknown as { innerType: { _def: { type: string } } }).innerType._def.type : inner.type;
      properties[key] = { type: zodTypeToSimple(baseType) };
      if (!isOpt) required.push(key);
    }
    return { type: "object", properties, required };
  }
  return { type: "object", properties: {} };
}

function zodTypeToSimple(typeName: string): string {
  switch (typeName) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "array": return "array";
    default: return "string";
  }
}
