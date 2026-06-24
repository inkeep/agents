'use client';

import { Search, X } from 'lucide-react';
import { DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  EvaluationResultFilters,
  OutputFilter,
} from '@/lib/evaluation/filter-evaluation-results';
import type { TimeRangeValue } from '@/lib/filters/time-range-filter';
import { ALL_TIME, CUSTOM_RANGE, TIME_RANGE_OPTIONS } from '@/lib/filters/time-range-filter';
import { OutputSchemaFilters } from './output-schema-filters';

interface EvaluationResultsFiltersProps {
  filters: EvaluationResultFilters;
  onFiltersChange: (filters: EvaluationResultFilters) => void;
  evaluators: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  availableOutputKeys?: string[];
  timeRange: TimeRangeValue;
  customStartDate: string;
  customEndDate: string;
  onTimeRangeChange: (value: TimeRangeValue) => void;
  onCustomDateRangeChange: (start: string, end: string) => void;
}

export function EvaluationResultsFilters({
  filters,
  onFiltersChange,
  evaluators,
  agents,
  availableOutputKeys,
  timeRange,
  customStartDate,
  customEndDate,
  onTimeRangeChange,
  onCustomDateRangeChange,
}: EvaluationResultsFiltersProps) {
  const updateFilter = (key: keyof EvaluationResultFilters, value: unknown) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? undefined : value,
    });
  };

  const handleOutputFiltersChange = (outputFilters: OutputFilter[]) => {
    onFiltersChange({
      ...filters,
      outputFilters: outputFilters.length > 0 ? outputFilters : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DatePickerWithPresets<TimeRangeValue>
          label="Time range"
          value={
            timeRange === CUSTOM_RANGE ? { from: customStartDate, to: customEndDate } : timeRange
          }
          onAdd={onTimeRangeChange}
          onRemove={() => onTimeRangeChange(ALL_TIME)}
          setCustomDateRange={onCustomDateRangeChange}
          options={TIME_RANGE_OPTIONS}
        />

        <InputGroup className="max-w-sm">
          <InputGroupInput
            type="text"
            placeholder="Search input..."
            value={filters.searchInput || ''}
            onChange={(e) => updateFilter('searchInput', e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          {filters.searchInput && (
            <InputGroupAddon align="inline-end">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  updateFilter('searchInput', '');
                }}
                aria-label="Clear search"
              >
                <X />
              </Button>
            </InputGroupAddon>
          )}
        </InputGroup>

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
          onValueChange={(value) =>
            updateFilter('evaluatorId', value === 'all' ? undefined : value)
          }
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
      </div>

      <OutputSchemaFilters
        filters={filters.outputFilters || []}
        onFiltersChange={handleOutputFiltersChange}
        availableKeys={availableOutputKeys}
      />
    </div>
  );
}
