import { describe, expect, it } from 'vitest';
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { getEvaluationJobLabel, UNFILTERED_JOB_LABEL } from '../job-config-label';

// Helper: build a minimal job config with just the jobFilters the label reads.
const job = (jobFilters: unknown): Pick<EvaluationJobConfig, 'jobFilters'> =>
  ({ jobFilters }) as Pick<EvaluationJobConfig, 'jobFilters'>;

describe('getEvaluationJobLabel', () => {
  it('renders a date range when both dates are set', () => {
    const startDate = '2026-01-02T00:00:00.000Z';
    const endDate = '2026-01-09T23:59:59.999Z';

    // Assert against locale-formatted dates so the test is locale-agnostic.
    const expected = `${new Date(startDate).toLocaleDateString()} - ${new Date(
      endDate
    ).toLocaleDateString()}`;

    expect(getEvaluationJobLabel(job({ dateRange: { startDate, endDate } }))).toBe(expected);
  });

  it('prefers the date range over dataset run IDs when both are present', () => {
    const startDate = '2026-01-02T00:00:00.000Z';
    const endDate = '2026-01-09T00:00:00.000Z';
    const expected = `${new Date(startDate).toLocaleDateString()} - ${new Date(
      endDate
    ).toLocaleDateString()}`;

    expect(
      getEvaluationJobLabel(job({ dateRange: { startDate, endDate }, datasetRunIds: ['run-1'] }), {
        'run-1': 'Nightly Run',
      })
    ).toBe(expected);
  });

  it('joins resolved dataset run names', () => {
    expect(
      getEvaluationJobLabel(job({ datasetRunIds: ['run-1', 'run-2'] }), {
        'run-1': 'Nightly Run',
        'run-2': 'Smoke Run',
      })
    ).toBe('Nightly Run, Smoke Run');
  });

  it('falls back to a short run label when a dataset run name is unknown', () => {
    expect(getEvaluationJobLabel(job({ datasetRunIds: ['abcdef1234567890'] }))).toBe(
      'Run abcdef12'
    );
  });

  it('falls back to a short run label when no name map is provided', () => {
    expect(
      getEvaluationJobLabel(job({ datasetRunIds: ['run-1'] }), { 'other-run': 'Unrelated' })
    ).toBe('Run run-1');
  });

  it('returns the unfiltered label when jobFilters is null', () => {
    expect(getEvaluationJobLabel(job(null))).toBe(UNFILTERED_JOB_LABEL);
  });

  it('returns the unfiltered label when jobFilters is undefined', () => {
    expect(getEvaluationJobLabel(job(undefined))).toBe(UNFILTERED_JOB_LABEL);
  });

  it('returns the unfiltered label for a partial date range (only startDate)', () => {
    expect(
      getEvaluationJobLabel(job({ dateRange: { startDate: '2026-01-02T00:00:00.000Z' } }))
    ).toBe(UNFILTERED_JOB_LABEL);
  });

  it('returns the unfiltered label for an empty datasetRunIds array', () => {
    expect(getEvaluationJobLabel(job({ datasetRunIds: [] }))).toBe(UNFILTERED_JOB_LABEL);
  });
});
