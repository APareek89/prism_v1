import { describe, expect, it } from 'vitest';
import { can } from '@/lib/auth/roles';
import { visibleNavItems } from '@/lib/nav/routes';
import { disabledDimensionReason } from './catalog';

describe('configuration access and dependency policy', () => {
  it('keeps members in My View and My Actions only', () => {
    const labels = visibleNavItems(['developer']).map((item) => item.label);
    expect(labels).toEqual(['My View', 'My Actions']);
    expect(can({ roles: ['developer'] }, 'view_function_aggregates')).toBe(false);
    expect(can({ roles: ['developer'] }, 'manage_own_actions')).toBe(true);
  });

  it('gives management organization views but no configuration', () => {
    const labels = visibleNavItems(['function_lead']).map((item) => item.label);
    expect(labels).toContain('Overview');
    expect(labels).toContain('Org Actions');
    expect(labels).not.toContain('Configuration');
  });

  it('explains a disabled dimension from approved data dependencies', () => {
    const enabled = new Set(['github.pull_requests', 'github.change_shape', 'github.commits']);
    expect(disabledDimensionReason('efficiency', enabled)).toContain('llm.token_usage or claude.token_usage');
    expect(disabledDimensionReason('effectiveness', enabled)).toContain('github.reverts');
  });
});
