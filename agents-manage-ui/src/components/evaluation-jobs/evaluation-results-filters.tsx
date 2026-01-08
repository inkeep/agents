'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  agentId?: string;
  searchInput?: string;
}

interface EvaluationResultsFiltersProps {
  filters: EvaluationResultFilters;
  onFiltersChange: (filters: EvaluationResultFilters) => void;
  evaluators: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
}

export function EvaluationResultsFilters({
  filters,
  onFiltersChange,
  evaluators,
  agents,
}: EvaluationResultsFiltersProps) {
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search input..."
          value={filters.searchInput || ''}
          onChange={(e) => updateFilter('searchInput', e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <Select
        value={filters.status || 'all'}
        onValueChange={(value) => updateFilter('status', value)}
      >
        <SelectTrigger className="h-9 w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="passed">Passed</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="no_criteria">No Criteria</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.evaluatorId || 'all'}
        onValueChange={(value) => updateFilter('evaluatorId', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="h-9 w-[160px]">
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

      <Select
        value={filters.agentId || 'all'}
        onValueChange={(value) => updateFilter('agentId', value === 'all' ? undefined : value)}
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="All agents" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Agents</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
