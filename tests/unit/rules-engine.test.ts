import { describe, it, expect } from 'vitest';
import { calculateReadinessScore, DEFAULT_RULES } from '@/lib/rules-engine';

describe('calculateReadinessScore', () => {
  it('returns 0 for a completely empty issue', () => {
    const score = calculateReadinessScore({}, DEFAULT_RULES);
    expect(score).toBe(0);
  });

  it('returns 5.0 for a fully complete issue', () => {
    const issue = {
      description:
        'Acceptance Criteria:\n- Login works\n- Logout works\n\n' +
        'Technical Design:\n- JWT tokens in httpOnly cookies with secure flag enabled and refresh token rotation\n\n' +
        'Dependency: Blocked by DB migration\n\n' +
        'Test Strategy:\n- Unit tests for auth service covering all branches\n\n' +
        'User Impact: All users need this to access the app',
      assignee: 'alice@example.com',
      priority: { name: 'High' },
      labels: ['backend', 'security'],
      customfield_10016: 8,
    };
    const score = calculateReadinessScore(issue, DEFAULT_RULES);
    expect(score).toBe(5);
  });

  it('returns a partial score for an issue missing some fields', () => {
    const issue = {
      description: 'Acceptance Criteria:\n- Dark mode toggle works',
      assignee: '',
      priority: null,
      labels: [],
      customfield_10016: null,
    };
    const score = calculateReadinessScore(issue, DEFAULT_RULES);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(5);
  });

  it('skips disabled rules', () => {
    const allDisabled = DEFAULT_RULES.map(r => ({ ...r, enabled: false }));
    const score = calculateReadinessScore({}, allDisabled);
    // No enabled rules → totalWeight 0 → returns 0
    expect(score).toBe(0);
  });

  it('handles rules with empty expectedPattern (field_presence only)', () => {
    const rules = [
      {
        name: 'Assignee Set',
        description: 'test',
        enabled: true,
        severity: 'info',
        weight: 1.0,
        detectionMethod: 'field_presence',
        targetField: 'assignee',
        expectedPattern: '',
        minLength: null,
      },
    ];

    // With assignee present
    expect(calculateReadinessScore({ assignee: 'bob' }, rules)).toBe(5);

    // With assignee empty
    expect(calculateReadinessScore({ assignee: '' }, rules)).toBe(0);

    // With assignee missing
    expect(calculateReadinessScore({}, rules)).toBe(0);
  });

  it('enforces minLength on pattern matches', () => {
    const rules = [
      {
        name: 'AC Present',
        description: 'test',
        enabled: true,
        severity: 'error',
        weight: 1.0,
        detectionMethod: 'field_presence',
        targetField: 'description',
        expectedPattern: '(acceptance criteria)',
        minLength: 50,
      },
    ];

    // Pattern matches but too short
    expect(calculateReadinessScore({ description: 'acceptance criteria: yes' }, rules)).toBe(0);

    // Pattern matches and long enough
    const longDesc = 'acceptance criteria: ' + 'x'.repeat(50);
    expect(calculateReadinessScore({ description: longDesc }, rules)).toBe(5);
  });

  it('is case insensitive for pattern matching', () => {
    const rules = [
      {
        name: 'AC Present',
        description: 'test',
        enabled: true,
        severity: 'error',
        weight: 1.0,
        detectionMethod: 'field_presence',
        targetField: 'description',
        expectedPattern: '(acceptance criteria)',
        minLength: null,
      },
    ];

    expect(calculateReadinessScore({ description: 'ACCEPTANCE CRITERIA: done' }, rules)).toBe(5);
    expect(calculateReadinessScore({ description: 'Acceptance Criteria: done' }, rules)).toBe(5);
  });

  it('strips (?i) Python-style inline flags without error', () => {
    const rules = [
      {
        name: 'AC Present',
        description: 'test',
        enabled: true,
        severity: 'error',
        weight: 1.0,
        detectionMethod: 'field_presence',
        targetField: 'description',
        expectedPattern: '(?i)(acceptance criteria)',
        minLength: null,
      },
    ];

    // Should not throw and should still match case-insensitively
    expect(() => calculateReadinessScore({ description: 'Acceptance Criteria' }, rules)).not.toThrow();
    expect(calculateReadinessScore({ description: 'Acceptance Criteria' }, rules)).toBe(5);
  });

  it('returns correct weighted score with mixed rules', () => {
    const rules = [
      {
        name: 'Rule A',
        description: 'test',
        enabled: true,
        severity: 'error',
        weight: 1.0,
        detectionMethod: 'field_presence',
        targetField: 'fieldA',
        expectedPattern: '',
        minLength: null,
      },
      {
        name: 'Rule B',
        description: 'test',
        enabled: true,
        severity: 'warn',
        weight: 1.0,
        detectionMethod: 'field_presence',
        targetField: 'fieldB',
        expectedPattern: '',
        minLength: null,
      },
    ];

    // Only Rule A passes → 1.0 / 2.0 * 5 = 2.5
    const score = calculateReadinessScore({ fieldA: 'value', fieldB: '' }, rules);
    expect(score).toBe(2.5);
  });
});
