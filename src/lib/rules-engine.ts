export const DEFAULT_RULES = [
  {
    name: 'Acceptance Criteria Present',
    description: 'Story must have clear acceptance criteria defined',
    enabled: true,
    severity: 'error',
    weight: 1.0,
    detectionMethod: 'field_presence',
    targetField: 'description',
    expectedPattern: '(?i)(acceptance criteria|AC:)',
    minLength: 20,
  },
  {
    name: 'Story Points Estimated',
    description: 'Story must have story points assigned',
    enabled: true,
    severity: 'warn',
    weight: 0.8,
    detectionMethod: 'field_presence',
    targetField: 'customfield_10016',
    expectedPattern: '',
    minLength: null,
  },
  {
    name: 'Assignee Set',
    description: 'Story should have an assignee before sprint',
    enabled: true,
    severity: 'info',
    weight: 0.5,
    detectionMethod: 'field_presence',
    targetField: 'assignee',
    expectedPattern: '',
    minLength: null,
  },
  {
    name: 'Technical Design Present',
    description: 'Complex stories should have technical design notes',
    enabled: true,
    severity: 'warn',
    weight: 0.9,
    detectionMethod: 'field_presence',
    targetField: 'description',
    expectedPattern: '(?i)(technical design|design notes|architecture)',
    minLength: 50,
  },
  {
    name: 'Dependencies Identified',
    description: 'Story should document any dependencies',
    enabled: true,
    severity: 'warn',
    weight: 0.7,
    detectionMethod: 'field_presence',
    targetField: 'description',
    expectedPattern: '(?i)(depends on|dependency|blocked by)',
    minLength: null,
  },
  {
    name: 'Test Strategy Defined',
    description: 'Story should have testing approach documented',
    enabled: true,
    severity: 'warn',
    weight: 0.8,
    detectionMethod: 'field_presence',
    targetField: 'description',
    expectedPattern: '(?i)(test strategy|testing approach|QA notes)',
    minLength: 30,
  },
  {
    name: 'User Impact Documented',
    description: 'Story should explain impact on users',
    enabled: true,
    severity: 'info',
    weight: 0.6,
    detectionMethod: 'field_presence',
    targetField: 'description',
    expectedPattern: '(?i)(user impact|affects users|customer impact)',
    minLength: null,
  },
  {
    name: 'Labels Present',
    description: 'Story should have relevant labels/tags',
    enabled: true,
    severity: 'info',
    weight: 0.4,
    detectionMethod: 'field_presence',
    targetField: 'labels',
    expectedPattern: '',
    minLength: null,
  },
  {
    name: 'Priority Set',
    description: 'Story must have a priority level',
    enabled: true,
    severity: 'error',
    weight: 0.9,
    detectionMethod: 'field_presence',
    targetField: 'priority',
    expectedPattern: '',
    minLength: null,
  },
];

export function calculateReadinessScore(issue: any, rules: typeof DEFAULT_RULES): number {
  let totalWeight = 0;
  let earnedScore = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    totalWeight += rule.weight;

    const fieldValue = issue[rule.targetField] || '';
    let passes = false;

    if (rule.detectionMethod === 'field_presence') {
      if (rule.expectedPattern) {
        const regex = new RegExp(rule.expectedPattern, 'i');
        passes = regex.test(String(fieldValue));
      } else {
        passes = fieldValue !== '' && fieldValue !== null && fieldValue !== undefined;
      }

      if (passes && rule.minLength) {
        passes = String(fieldValue).length >= rule.minLength;
      }
    }

    if (passes) {
      earnedScore += rule.weight;
    }
  }

  return totalWeight > 0 ? (earnedScore / totalWeight) * 5 : 0;
}
