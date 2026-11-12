import { describe, expect, it } from 'vitest';
import {
  checkAutomationLoopProtection,
  evaluateAllConditions,
  MAX_AUTOMATION_DEPTH,
} from '../../src/modules/automations/domain/automation-engine';

describe('Automation Engine & Loop Protection', () => {
  it('evaluates nested conditions across all operators', () => {
    const context = {
      ticket: {
        priority: 'CRITICAL',
        title: 'Queda de VPN na filial Campinas',
        tags: ['rede', 'vpn'],
        assigneeId: null,
        elapsedMinutes: 45,
      },
    };

    const matched = evaluateAllConditions(
      [
        { field: 'ticket.priority', operator: 'in', value: ['HIGH', 'CRITICAL'] },
        { field: 'ticket.title', operator: 'contains', value: 'vpn' },
        { field: 'ticket.tags', operator: 'contains', value: 'rede' },
        { field: 'ticket.assigneeId', operator: 'is_empty' },
        { field: 'ticket.elapsedMinutes', operator: 'gt', value: 30 },
        { field: 'ticket.elapsedMinutes', operator: 'lt', value: 60 },
        { field: 'ticket.title', operator: 'not_empty' },
        { field: 'ticket.priority', operator: 'neq', value: 'LOW' },
      ],
      context,
    );

    expect(matched).toBe(true);
  });

  it('prevents infinite automation loops by rule reuse and max depth', () => {
    const first = checkAutomationLoopProtection({
      depth: 1,
      ruleId: 'rule-1',
      executedRuleIdsInChain: [],
    });
    expect(first.allowed).toBe(true);

    const repeat = checkAutomationLoopProtection({
      depth: 2,
      ruleId: 'rule-1',
      executedRuleIdsInChain: ['rule-1'],
    });
    expect(repeat.allowed).toBe(false);

    const tooDeep = checkAutomationLoopProtection({
      depth: MAX_AUTOMATION_DEPTH,
      ruleId: 'rule-2',
      executedRuleIdsInChain: [],
    });
    expect(tooDeep.allowed).toBe(false);
  });
});

