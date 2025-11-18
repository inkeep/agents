'use client';

import { CheckCircle2, Minus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EvaluationStatus } from '@/lib/evaluation/pass-criteria-evaluator';

interface EvaluationStatusBadgeProps {
  status: EvaluationStatus;
  className?: string;
}

export function EvaluationStatusBadge({ status, className }: EvaluationStatusBadgeProps) {
  if (status === 'no_criteria') {
    return (
      <Badge variant="secondary" className={className}>
        <Minus className="h-3 w-3 mr-1" />
        N/A
      </Badge>
    );
  }

  return (
    <Badge
      variant={status === 'passed' ? 'default' : 'destructive'}
      className={className}
    >
      {status === 'passed' ? (
        <>
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Passed
        </>
      ) : (
        <>
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </>
      )}
    </Badge>
  );
}

