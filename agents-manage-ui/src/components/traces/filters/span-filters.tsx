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
import type { SpanAttribute } from '@/hooks/use-traces-query-state';

interface SpanFiltersProps {
  availableSpanNames: string[];
  spanName: string;
  setSpanFilter: (spanName: string, attributes: SpanAttribute[]) => void;
  attributes: SpanAttribute[];
  addAttribute: () => void;
  removeAttribute: (index: number) => void;
  updateAttribute: (index: number, field: 'key' | 'value' | 'operator', value: string) => void;
  isNumeric: (value: string) => boolean;
  spanNamesLoading: boolean;
  selectedAgent?: string;
}

export function SpanFilters({
  availableSpanNames,
  spanName,
  setSpanFilter,
  attributes,
  addAttribute,
  removeAttribute,
  updateAttribute,
  isNumeric,
  spanNamesLoading,
  selectedAgent,
}: SpanFiltersProps) {
  const totalFilters = attributes.length + (spanName ? 1 : 0);
  return (
    <Collapsible defaultOpen={totalFilters > 0} className="border rounded-lg bg-background w-full">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex items-center justify-start gap-2 w-full group p-0 h-auto  hover:!bg-transparent transition-colors py-2 px-4"
        >
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          Span filters
          {totalFilters > 0 && <Badge variant="code">{totalFilters}</Badge>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-6  mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
        <div>
          <div className="space-y-4">
            {/* Span Name Filter */}
            <div className="space-y-1">
              <Label htmlFor="span-name" className="text-sm">
                Span Name
              </Label>
              {availableSpanNames.length > 0 ? (
                <Select
                  value={spanName || 'none'}
                  onValueChange={(value) =>
                    setSpanFilter(value === 'none' ? '' : value, attributes)
                  }
                >
                  <SelectTrigger id="span-name">
                    <SelectValue placeholder="Select span name (e.g. ai.toolCall)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No filter</SelectItem>
                    {spanNamesLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading span names...
                      </SelectItem>
                    ) : (
                      availableSpanNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="span-name"
                  placeholder="Enter span name (e.g. ai.toolCall, ai.generateText)"
                  value={spanName}
                  onChange={(e) => setSpanFilter(e.target.value, attributes)}
                  className="bg-background"
                />
              )}
              {spanNamesLoading && (
                <p className="text-xs text-muted-foreground">Loading available span names...</p>
              )}
              {!spanNamesLoading && availableSpanNames.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No span names found in {selectedAgent ? `agent "${selectedAgent}"` : 'any agent'}.
                  You can type a custom span name above.
                </p>
              )}
              {!spanNamesLoading && availableSpanNames.length > 0 && selectedAgent && (
                <p className="text-xs text-muted-foreground">
                  Showing span names from agent "{selectedAgent}" only
                </p>
              )}
            </div>

            {/* Attributes Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Span Attributes</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
                  <Plus className="h-3 w-3" />
                  Add Attribute
                </Button>
              </div>

              {attributes.map((attr, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="Attribute key (e.g. ai.agentName)"
                      value={attr.key}
                      onChange={(e) => updateAttribute(index, 'key', e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  {/* Operator selection - now available for all attribute types */}
                  <div>
                    <Select
                      value={attr.operator || '='}
                      onValueChange={(
                        value:
                          | '='
                          | '!='
                          | '<'
                          | '>'
                          | '<='
                          | '>='
                          | 'in'
                          | 'nin'
                          | 'contains'
                          | 'ncontains'
                          | 'regex'
                          | 'nregex'
                          | 'like'
                          | 'nlike'
                          | 'exists'
                          | 'nexists'
                      ) => updateAttribute(index, 'operator', value)}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="=">=</SelectItem>
                        <SelectItem value="!=">!=</SelectItem>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value="<=">≤</SelectItem>
                        <SelectItem value=">=">≥</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                        <SelectItem value="nin">not in</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="ncontains">not contains</SelectItem>
                        <SelectItem value="regex">regex</SelectItem>
                        <SelectItem value="nregex">not regex</SelectItem>
                        <SelectItem value="like">like</SelectItem>
                        <SelectItem value="nlike">not like</SelectItem>
                        <SelectItem value="exists">exists</SelectItem>
                        <SelectItem value="nexists">not exists</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1">
                    <Input
                      placeholder={(() => {
                        const op = attr.operator || '=';
                        if (op === 'exists' || op === 'nexists') return 'No value needed';
                        if (op === 'in' || op === 'nin')
                          return 'Comma-separated values (e.g. val1,val2,val3)';
                        if (op === 'regex' || op === 'nregex') return 'Regular expression pattern';
                        if (op === 'like' || op === 'nlike')
                          return 'Pattern with % wildcards (e.g. %value%)';
                        if (op === '<' || op === '>' || op === '<=' || op === '>=')
                          return 'Numeric value';
                        return 'Attribute value (e.g. qa)';
                      })()}
                      value={attr.value}
                      onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                      className="bg-background"
                      disabled={attr.operator === 'exists' || attr.operator === 'nexists'}
                      type={
                        (attr.operator === '<' ||
                          attr.operator === '>' ||
                          attr.operator === '<=' ||
                          attr.operator === '>=') &&
                        isNumeric(attr.value)
                          ? 'number'
                          : 'text'
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeAttribute(index)}
                    className="px-2"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {attributes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No attribute filters added. Click "Add Attribute" to filter by span attributes.
                </p>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
