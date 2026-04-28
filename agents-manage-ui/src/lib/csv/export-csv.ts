import Papa from 'papaparse';
import { toast } from 'sonner';
import type { EvaluationResult } from '@/lib/api/evaluation-results';
import type { EvaluationStatus } from '@/lib/evaluation/pass-criteria-evaluator';
import { evaluatePassCriteria } from '@/lib/evaluation/pass-criteria-evaluator';
import { formatDateTimeTable } from '@/lib/utils/format-date';

interface EvalExportContext {
  results: EvaluationResult[];
  getEvaluatorName: (evaluatorId: string) => string;
  getEvaluatorById: (evaluatorId: string) =>
    | {
        passCriteria?: {
          operator: 'and' | 'or';
          conditions: {
            field: string;
            operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
            value: number;
          }[];
        } | null;
      }
    | undefined;
  filename: string;
}

export function exportEvaluationResultsCsv({
  results,
  getEvaluatorName,
  getEvaluatorById,
  filename,
}: EvalExportContext): void {
  const rows = [...results]
    .sort((a, b) => {
      const aTime = a.conversationCreatedAt || a.createdAt;
      const bTime = b.conversationCreatedAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
    .map((result) => {
      const evaluator = getEvaluatorById(result.evaluatorId);
      const resultData =
        result.output && typeof result.output === 'object'
          ? (result.output as Record<string, unknown>)
          : {};
      const outputData =
        resultData.output && typeof resultData.output === 'object'
          ? (resultData.output as Record<string, unknown>)
          : resultData;
      const evaluation = evaluatePassCriteria(evaluator?.passCriteria, outputData);

      return {
        input: result.input || result.conversationId,
        time: result.conversationCreatedAt
          ? formatDateTimeTable(result.conversationCreatedAt, { local: true })
          : '',
        agent: result.agentId || '',
        evaluator: getEvaluatorName(result.evaluatorId),
        pass_fail: evaluation.status as EvaluationStatus,
        conversation_id: result.conversationId,
        output: result.output ? JSON.stringify(result.output) : '',
      };
    });

  downloadCsv(rows, filename);
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) {
    toast.error('No data to export');
    return;
  }

  try {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    toast.success(`Exported ${rows.length} rows to CSV`);
  } catch {
    toast.error('Failed to export CSV');
  }
}
