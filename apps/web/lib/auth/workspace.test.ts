import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceEmail } from './workspace';

describe('normalizeWorkspaceEmail', () => {
  it('normalizes a valid workspace email', () => {
    expect(normalizeWorkspaceEmail('  Anand@Example.COM ')).toBe('anand@example.com');
  });

  it('rejects malformed or incomplete addresses', () => {
    expect(normalizeWorkspaceEmail('not-an-email')).toBeNull();
    expect(normalizeWorkspaceEmail('name@example')).toBeNull();
    expect(normalizeWorkspaceEmail('name @example.com')).toBeNull();
  });
});
