import type { PrismaClient } from "@/core/db/generated/prisma/client";

/**
 * Abstract LLM provider interface. OpenAI-compatible by default.
 * Platform Admin configures endpoint/model/key via ai_providers table.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LLMResponse {
  message: ChatMessage;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 */
export async function callLLM(
  provider: { endpoint: string; model: string; apiKey: string },
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: 0.3,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${provider.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new Error(`LLM provider error ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    choices: { message: ChatMessage }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    message: data.choices[0]?.message ?? { role: "assistant", content: "" },
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Get the active AI provider for the platform. Falls back to mock if none configured.
 */
export async function getActiveProvider(tx: PrismaClient) {
  const provider = await tx.aiProvider.findFirst({ where: { isActive: true } });
  if (provider) {
    return { endpoint: provider.endpoint, model: provider.model, apiKey: provider.apiKey, name: provider.name };
  }
  // Mock provider for testing
  return {
    endpoint: "http://localhost:11434/v1",
    model: "mock",
    apiKey: "mock-key",
    name: "mock",
  };
}
