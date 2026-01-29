'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getTypeBadgeVariant } from '@/lib/utils/mcp-schema-parser';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface SchemaProperty {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  enum?: string[];
  properties?: SchemaProperty[];
  items?: SchemaProperty;
}

interface PropertyDisplayProps {
  property: SchemaProperty;
  level: number;
}

export function PropertyDisplay({ property, level }: PropertyDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels
  const indentClass = level > 0 ? `ml-${Math.min(level * 4, 8)}` : '';
  const hasNested =
    (property.properties && property.properties.length > 0) ||
    (property.items && (property.items.properties || property.items.items));

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
          {property.description && (
            <span className="text-xs text-muted-foreground max-w-xs truncate">
              {property.description}
            </span>
          )}
        </div>
        <Badge variant={getTypeBadgeVariant(property.type)} className="text-xs">
          {property.type}
        </Badge>
      </div>

      {/* Nested properties */}
      {isExpanded && hasNested && (
        <div className="ml-4 space-y-1 border-l border-border pl-3">
          {/* Object properties */}
          {property.properties?.map((nestedProp) => (
            <PropertyDisplay key={nestedProp.name} property={nestedProp} level={level + 1} />
          ))}

          {/* Array item properties */}
          {property.items?.properties && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Array items:</div>
              {property.items.properties.map((itemProp) => (
                <PropertyDisplay key={itemProp.name} property={itemProp} level={level + 1} />
              ))}
            </div>
          )}

          {/* Nested array items */}
          {property.items?.items && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Array items:</div>
              <PropertyDisplay property={property.items} level={level + 1} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
