import { describe, expect, it } from 'vitest';
import { reportAgentStarterTemplate } from '../report-agent-templates';

describe('reportAgentStarterTemplate', () => {
  it('provides a stable actionable-report template', () => {
    expect(reportAgentStarterTemplate.id).toBe('actionable-report');
    expect(reportAgentStarterTemplate.label).toBe('Actionable report');
    expect(reportAgentStarterTemplate.description).toContain('Recurring report agent');
  });

  it('includes chart and action guidance in the prompt', () => {
    expect(reportAgentStarterTemplate.prompt).toContain('chart artifacts');
    expect(reportAgentStarterTemplate.prompt).toContain('Slack or Jira tools');
    expect(reportAgentStarterTemplate.prompt).toContain('actionable output');
  });
});
