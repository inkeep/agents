'use client';

import type { NormalizedSchemaNode } from '@inkeep/agents-core/utils/json-schema-walk';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getTypeBadgeVariant } from '@/lib/utils/mcp-schema-parser';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface PropertyDisplayProps {
  property: NormalizedSchemaNode;
  level: number;
}

export function PropertyDisplay({ property, level }: PropertyDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels
  const indentClass = level > 0 ? `ml-${Math.min(level * 4, 8)}` : '';
  // An array item is only worth expanding when it carries its own structure;
  // a primitive item array (e.g. string[]) is fully described by the [] suffix + type badge.
  const itemHasDetail =
    !!property.items &&
    (!!property.items.properties?.length ||
      !!property.items.items ||
      !!property.items.variants?.length ||
      !!property.items.enumValues?.length ||
      !!property.items.recursive);
  const hasNested =
    (property.properties && property.properties.length > 0) ||
    itemHasDetail ||
    (property.variants && property.variants.length > 0);
  const enumValues = property.enumValues;

  return (
    <div className={cn('space-y-1', indentClass)}>
      {/* Property header */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {hasNested && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="hover:bg-transparent"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </Button>
            )}
            <code className="text-xs font-mono">{property.name}</code>
            {property.type === 'array' && property.items && (
              <span className="text-xs text-muted-foreground">[]</span>
            )}
          </div>
          {!property.required && (
            <span className="text-xs text-gray-500 dark:text-white/40">optional</span>
          )}
          {property.nullable && (
            <span className="text-xs text-gray-500 dark:text-white/40">nullable</span>
          )}
          {property.description && (
            <span className="text-xs text-muted-foreground max-w-xs truncate">
              {property.description}
            </span>
          )}
          {enumValues && enumValues.length > 0 && (
            <span className="text-xs text-muted-foreground max-w-xs truncate">
              enum: {enumValues.map((value) => String(value)).join(', ')}
            </span>
          )}
        </div>
        <Badge variant={getTypeBadgeVariant(property.type)} className="text-xs">
          {property.type}
        </Badge>
      </div>

      {/* Nested structure */}
      {isExpanded && hasNested && (
        <div className="ml-4 space-y-1 border-l border-border pl-3">
          {/* Object properties */}
          {property.properties?.map((nestedProp) => (
            <PropertyDisplay key={nestedProp.name} property={nestedProp} level={level + 1} />
          ))}

          {/* Array item schema */}
          {property.items && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Array items:</div>
              <PropertyDisplay property={property.items} level={level + 1} />
            </div>
          )}

          {/* Union variants */}
          {property.variants && property.variants.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Variants (one of):</div>
              {property.variants.map((variant, index) => (
                <PropertyDisplay key={variant.name || index} property={variant} level={level + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
