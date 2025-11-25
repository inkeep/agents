'use client';

import { Filter, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EvaluationStatus } from '@/lib/evaluation/pass-criteria-evaluator';

export interface EvaluationResultFilters {
  status?: EvaluationStatus | 'all';
  evaluatorId?: string;
}

interface EvaluationResultsFiltersProps {
  filters: EvaluationResultFilters;
  onFiltersChange: (filters: EvaluationResultFilters) => void;
  evaluators: Array<{ id: string; name: string }>;
}

export function EvaluationResultsFilters({
  filters,
  onFiltersChange,
  evaluators,
}: EvaluationResultsFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof EvaluationResultFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? undefined : value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== undefined && value !== 'all'
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          {isExpanded ? 'Hide Filters' : 'Show Filters'}
          {hasActiveFilters && !isExpanded && (
            <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Active
            </span>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear Filters
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status-filter" className="text-xs font-medium">
                Status
              </Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => updateFilter('status', value)}
              >
                <SelectTrigger id="status-filter" className="h-9">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="no_criteria">No Criteria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evaluator-filter" className="text-xs font-medium">
                Evaluator
              </Label>
              <Select
                value={filters.evaluatorId || 'all'}
                onValueChange={(value) => updateFilter('evaluatorId', value === 'all' ? undefined : value)}
              >
                <SelectTrigger id="evaluator-filter" className="h-9">
                  <SelectValue placeholder="All evaluators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Evaluators</SelectItem>
                  {evaluators.map((evaluator) => (
                    <SelectItem key={evaluator.id} value={evaluator.id}>
                      {evaluator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

