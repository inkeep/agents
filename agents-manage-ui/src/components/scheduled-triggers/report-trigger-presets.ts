export interface ReportTriggerPreset {
  id: string;
  label: string;
  description: string;
  triggerName: string;
  triggerDescription: string;
  cronExpression: string;
  messageTemplate: string;
  payloadJson: string;
  maxRetries: number;
  retryDelaySeconds: number;
  timeoutSeconds: number;
}

const dailyReportPayload = {
  reportType: 'daily-report',
  timeRange: 'last-24-hours',
  artifacts: [{ type: 'chart', title: 'Daily trend summary' }],
  deliverTo: [{ type: 'slack', channel: '#team-insights' }],
  trackIn: [{ type: 'jira', projectKey: 'ENG' }],
};

const weeklyDigestPayload = {
  reportType: 'weekly-digest',
  timeRange: 'last-7-days',
  artifacts: [{ type: 'chart', title: 'Weekly trend summary' }],
  deliverTo: [{ type: 'slack', channel: '#weekly-digest' }],
  trackIn: [{ type: 'jira', projectKey: 'ENG' }],
};

const actionableReviewPayload = {
  reportType: 'actionable-review',
  timeRange: 'last-7-days',
  severityThreshold: 'high',
  artifacts: [{ type: 'chart', title: 'Top issues by severity' }],
  deliverTo: [{ type: 'slack', channel: '#ops-reviews' }],
  trackIn: [{ type: 'jira', projectKey: 'OPS' }],
};

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2);
}

export const reportTriggerPresets: ReportTriggerPreset[] = [
  {
    id: 'daily-report',
    label: 'Daily report',
    description: 'Morning summary with charts and delivery targets.',
    triggerName: 'Daily Report',
    triggerDescription: 'Generate and deliver a daily report with charts and follow-up actions.',
    cronExpression: '0 9 * * *',
    messageTemplate: 'Generate the daily report for {{timeRange}} and share actionable findings.',
    payloadJson: formatPayload(dailyReportPayload),
    maxRetries: 2,
    retryDelaySeconds: 300,
    timeoutSeconds: 780,
  },
  {
    id: 'weekly-digest',
    label: 'Weekly digest',
    description: 'Monday morning summary of the previous week for longer-term trends.',
    triggerName: 'Weekly Digest',
    triggerDescription:
      'Generate a weekly digest with notable trends, charts, and follow-up items.',
    cronExpression: '0 9 * * 1',
    messageTemplate:
      'Generate the weekly digest for {{timeRange}} and highlight the biggest changes.',
    payloadJson: formatPayload(weeklyDigestPayload),
    maxRetries: 2,
    retryDelaySeconds: 300,
    timeoutSeconds: 780,
  },
  {
    id: 'actionable-review',
    label: 'Actionable review',
    description: 'High-signal review focused on follow-up actions.',
    triggerName: 'Actionable Review',
    triggerDescription:
      'Review recent signals, create charts when useful, and turn high-severity findings into tracked follow-up.',
    cronExpression: '0 10 * * 1-5',
    messageTemplate:
      'Review {{timeRange}} of activity, summarize the highest-severity findings, and create follow-up actions when appropriate.',
    payloadJson: formatPayload(actionableReviewPayload),
    maxRetries: 3,
    retryDelaySeconds: 300,
    timeoutSeconds: 780,
  },
];
