'use client';

import { ChevronRight, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  OutputFilter,
  OutputFilterOperator,
} from '@/lib/evaluation/filter-evaluation-results';

interface OutputSchemaFiltersProps {
  filters: OutputFilter[];
  onFiltersChange: (filters: OutputFilter[]) => void;
  /** List of output schema keys discovered from results */
  availableKeys?: string[];
}

export function OutputSchemaFilters({
  filters,
  onFiltersChange,
  availableKeys = [],
}: OutputSchemaFiltersProps) {
  const addFilter = () => {
    // Default to empty key ("No filter" selected)
    onFiltersChange([...filters, { key: '', operator: '=', value: '' }]);
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, field: keyof OutputFilter, value: string) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], [field]: value };
    onFiltersChange(updated);
  };

  const getPlaceholder = (operator: OutputFilterOperator): string => {
    switch (operator) {
      case 'exists':
      case 'nexists':
        return 'No value needed';
      case '<':
      case '>':
      case '<=':
      case '>=':
        return 'Numeric value';
      case 'contains':
      case 'ncontains':
        return 'Text to search for';
      default:
        return 'Value (e.g. true, 0.8, "text")';
    }
  };

  const hasAvailableKeys = availableKeys.length > 0;

  return (
    <Collapsible
      defaultOpen={filters.length > 0}
      className="border rounded-lg bg-background w-full"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex items-center justify-start gap-2 w-full group p-0 h-auto hover:!bg-transparent transition-colors py-2 px-4"
        >
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          Output Schema Filters
          {filters.length > 0 && <Badge variant="code">{filters.length}</Badge>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Filter by output fields</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFilter}
              disabled={!hasAvailableKeys}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Filter
            </Button>
          </div>

          {filters.map((filter, index) => (
            <div key={index} className="flex gap-2 items-center">
              <div className="flex-1 min-w-[200px]">
                <Select
                  value={filter.key || 'none'}
                  onValueChange={(value) =>
                    updateFilter(index, 'key', value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No filter</SelectItem>
                    {availableKeys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {key.replace(/^output\./, '')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-[120px]">
                <Select
                  value={filter.operator}
                  onValueChange={(value: OutputFilterOperator) =>
                    updateFilter(index, 'operator', value)
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="=">=</SelectItem>
                    <SelectItem value="!=">≠</SelectItem>
                    <SelectItem value="<">&lt;</SelectItem>
                    <SelectItem value=">">&gt;</SelectItem>
                    <SelectItem value="<=">≤</SelectItem>
                    <SelectItem value=">=">≥</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="ncontains">not contains</SelectItem>
                    <SelectItem value="exists">exists</SelectItem>
                    <SelectItem value="nexists">not exists</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Input
                  placeholder={getPlaceholder(filter.operator)}
                  value={filter.value}
                  onChange={(e) => updateFilter(index, 'value', e.target.value)}
                  className="bg-background"
                  disabled={filter.operator === 'exists' || filter.operator === 'nexists'}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeFilter(index)}
                className="px-2 flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {filters.length === 0 && !hasAvailableKeys && (
            <p className="text-xs text-muted-foreground">
              No output fields found in results. Run evaluations to populate available fields.
            </p>
          )}
          {filters.length === 0 && hasAvailableKeys && (
            <p className="text-xs text-muted-foreground">
              No filters added. Click "Add Filter" to filter by output schema fields.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
