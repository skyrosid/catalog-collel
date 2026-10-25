import { describe, expect, it } from 'vitest';
import { loginSchema, newPasswordSchema, sessionSchema } from './index.js';

describe('trust boundaries', () => {
  it('normalizes identifiers, preserves passwords, and rejects extra privileges', () => {
    expect(loginSchema.parse({ login: ' Admin ', password: ' pass ' })).toEqual({
      login: 'admin',
      password: ' pass ',
    });
    expect(loginSchema.safeParse({ login: 'admin', password: 'pass', role: 'admin' }).success).toBe(
      false,
    );
  });
  it('requires a long new password and at least one authorized collel', () => {
    expect(newPasswordSchema.safeParse('short').success).toBe(false);
    expect(
      sessionSchema.safeParse({
        user: { id: '00000000-0000-4000-8000-000000000001', displayName: 'Admin' },
        memberships: [],
      }).success,
    ).toBe(false);
  });
});
