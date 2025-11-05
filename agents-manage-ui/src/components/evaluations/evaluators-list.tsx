import type { Evaluator } from '@/lib/api/evaluations-client';
import { EvaluatorItem } from './evaluator-item';
import { NewEvaluatorItem } from './new-evaluator-item';

interface EvaluatorsListProps {
  tenantId: string;
  evaluators: Evaluator[];
}

export function EvaluatorsList({ tenantId, evaluators }: EvaluatorsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewEvaluatorItem tenantId={tenantId} />
      {evaluators?.map((evaluator: Evaluator) => (
        <EvaluatorItem key={evaluator.id} {...evaluator} tenantId={tenantId} />
      ))}
    </div>
  );
}

