import type { ConditionNode } from "./types";

/**
 * M6: Safe condition evaluator — walks a JSON AST. NO eval, NO Function().
 * Every operator is hardcoded; unknown fields resolve to undefined (falsy).
 */
export function evaluateConditions(
  node: ConditionNode,
  context: Record<string, unknown>,
): boolean {
  if ("logic" in node) {
    const results = node.children.map((child) => evaluateConditions(child, context));
    return node.logic === "and" ? results.every(Boolean) : results.some(Boolean);
  }

  // Empty object {} or missing field/op → always match (no conditions = always true).
  if (!node.field || !node.op) return true;

  const fieldValue = context[node.field];

  switch (node.op) {
    case "eq":
      return fieldValue === node.value;
    case "neq":
      return fieldValue !== node.value;
    case "gt":
      return Number(fieldValue) > Number(node.value);
    case "gte":
      return Number(fieldValue) >= Number(node.value);
    case "lt":
      return Number(fieldValue) < Number(node.value);
    case "lte":
      return Number(fieldValue) <= Number(node.value);
    case "in":
      return Array.isArray(node.value) && node.value.includes(fieldValue);
    case "contains":
      return String(fieldValue).includes(String(node.value));
    default:
      return false;
  }
}
