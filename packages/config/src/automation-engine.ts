import type { AutomationCondition, ConditionOperator } from '@civora/types';

export const MAX_AUTOMATION_DEPTH = 5;

export function resolveFieldPath(context: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateCondition(
  condition: AutomationCondition,
  context: Record<string, unknown>,
): boolean {
  const actual = resolveFieldPath(context, condition.field);
  const expected = condition.value;

  const op: ConditionOperator = condition.operator;
  switch (op) {
    case 'is_empty':
      return (
        actual === null ||
        actual === undefined ||
        (typeof actual === 'string' && actual.trim() === '') ||
        (Array.isArray(actual) && actual.length === 0)
      );
    case 'not_empty':
      return !(
        actual === null ||
        actual === undefined ||
        (typeof actual === 'string' && actual.trim() === '') ||
        (Array.isArray(actual) && actual.length === 0)
      );
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'contains':
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;
    case 'in':
      if (Array.isArray(expected)) {
        return expected.includes(actual as string);
      }
      return false;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
  }
}

export function evaluateAllConditions(
  conditions: AutomationCondition[],
  context: Record<string, unknown>,
): boolean {
  return conditions.every((cond) => evaluateCondition(cond, context));
}

export interface LoopProtectionCheck {
  allowed: boolean;
  reason?: string;
}

export function checkAutomationLoopProtection(params: {
  depth: number;
  ruleId: string;
  executedRuleIdsInChain: readonly string[];
}): LoopProtectionCheck {
  if (params.depth >= MAX_AUTOMATION_DEPTH) {
    return {
      allowed: false,
      reason: `Max automation depth (${MAX_AUTOMATION_DEPTH}) reached.`,
    };
  }
  if (params.executedRuleIdsInChain.includes(params.ruleId)) {
    return {
      allowed: false,
      reason: `Rule ${params.ruleId} already executed in correlation chain.`,
    };
  }
  return { allowed: true };
}

