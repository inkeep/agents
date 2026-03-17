import { describe, expect, it } from 'vitest';
import { reportTriggerPresets } from '../report-trigger-presets';

describe('reportTriggerPresets', () => {
  it('defines the expected report presets', () => {
    expect(reportTriggerPresets.map((preset) => preset.id)).toEqual([
      'daily-report',
      'weekly-digest',
      'actionable-review',
    ]);
  });

  it('includes usable delivery and tracking payload examples', () => {
    for (const preset of reportTriggerPresets) {
      const payload = JSON.parse(preset.payloadJson) as {
        reportType: string;
        artifacts: Array<{ type: string; title: string }>;
        deliverTo: Array<{ type: string; channel: string }>;
        trackIn: Array<{ type: string; projectKey: string }>;
      };

      expect(payload.reportType).toBe(preset.id);
      expect(payload.artifacts).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'chart' })])
      );
      expect(payload.deliverTo).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'slack' })])
      );
      expect(payload.trackIn).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'jira' })])
      );
    }
  });

  it('keeps retry and timeout defaults inside the supported range', () => {
    for (const preset of reportTriggerPresets) {
      expect(preset.maxRetries).toBeGreaterThanOrEqual(0);
      expect(preset.maxRetries).toBeLessThanOrEqual(10);
      expect(preset.retryDelaySeconds).toBeGreaterThanOrEqual(10);
      expect(preset.timeoutSeconds).toBeGreaterThanOrEqual(30);
      expect(preset.timeoutSeconds).toBeLessThanOrEqual(780);
    }
  });
});
