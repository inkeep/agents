'use client';

import { Filter, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface TestCaseFilters {
  agentId?: string;
  outputStatus?: 'all' | 'has_output' | 'no_output';
  searchInput?: string;
}

interface TestCaseFiltersProps {
  filters: TestCaseFilters;
  onFiltersChange: (filters: TestCaseFilters) => void;
  agents: Array<{ id: string; name: string }>;
}

export function TestCaseFilters({ filters, onFiltersChange, agents }: TestCaseFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof TestCaseFilters, value: string) => {
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
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search test cases..."
            value={filters.searchInput || ''}
            onChange={(e) => updateFilter('searchInput', e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          {isExpanded ? 'Hide Filters' : 'Show Filters'}
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
              <Label htmlFor="agent-filter" className="text-xs font-medium">
                Agent
              </Label>
              <Select
                value={filters.agentId || 'all'}
                onValueChange={(value) => updateFilter('agentId', value === 'all' ? '' : value)}
              >
                <SelectTrigger id="agent-filter" className="h-9">
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

            <div className="space-y-2">
              <Label htmlFor="output-filter" className="text-xs font-medium">
                Output Status
              </Label>
              <Select
                value={filters.outputStatus || 'all'}
                onValueChange={(value) => updateFilter('outputStatus', value)}
              >
                <SelectTrigger id="output-filter" className="h-9">
                  <SelectValue placeholder="All outputs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outputs</SelectItem>
                  <SelectItem value="has_output">Has Output</SelectItem>
                  <SelectItem value="no_output">No Output</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
