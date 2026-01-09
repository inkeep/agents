import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { MCPTool } from '@/lib/types/tools';
import { cn } from '@/lib/utils';
import { getTypeBadgeVariant, parseMCPInputSchema } from '@/lib/utils/mcp-schema-parser';
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

interface ToolCardProps {
  tool: {
    name: string;
    description?: string;
    inputSchema?: any;
  };
  isActive: boolean;
}

interface PropertyDisplayProps {
  property: SchemaProperty;
  level: number;
}

function PropertyDisplay({ property, level }: PropertyDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels
  const indentClass = level > 0 ? `ml-${Math.min(level * 4, 8)}` : '';
  const hasNested = (property.properties && property.properties.length > 0) || 
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
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-4 w-4 p-0 hover:bg-transparent"
              >
                {isExpanded ? 
                  <ChevronDown className="w-3 h-3" /> : 
                  <ChevronUp className="w-3 h-3" />
                }
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
            <PropertyDisplay 
              key={nestedProp.name} 
              property={nestedProp} 
              level={level + 1} 
            />
          ))}
          
          {/* Array item properties */}
          {property.items && property.items.properties && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Array items:</div>
              {property.items.properties.map((itemProp) => (
                <PropertyDisplay 
                  key={itemProp.name} 
                  property={itemProp} 
                  level={level + 1} 
                />
              ))}
            </div>
          )}
          
          {/* Nested array items */}
          {property.items && property.items.items && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Array items:</div>
              <PropertyDisplay 
                property={property.items} 
                level={level + 1} 
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, isActive }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const parsedSchema = tool.inputSchema ? parseMCPInputSchema(tool.inputSchema) : null;

  // Truncate description if it's too long
  const maxDescriptionLength = 200;
  const shouldTruncateDescription =
    tool.description && tool.description.length > maxDescriptionLength;
  const displayDescription =
    shouldTruncateDescription && !showFullDescription
      ? `${tool.description?.substring(0, maxDescriptionLength)}...`
      : tool.description;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Tool header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant={isActive ? 'primary' : 'code'}
            className={cn(!isActive && 'bg-transparent text-foreground')}
          >
            {tool.name}
          </Badge>
          {parsedSchema?.hasProperties && (
            <Badge variant="code">
              {parsedSchema.properties.length} parameter
              {parsedSchema.properties.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {(tool.description || parsedSchema?.hasProperties) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* Tool description */}
      {tool.description && (
        <div>
          <p className="text-sm text-muted-foreground leading-relaxed">{displayDescription}</p>
          {shouldTruncateDescription && (
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowFullDescription(!showFullDescription)}
              className="h-auto p-0 text-xs"
            >
              {showFullDescription ? 'Show less' : 'Show more'}
            </Button>
          )}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && parsedSchema?.hasProperties && (
        <div className="space-y-3 pt-2 border-t">
          <div className="text-sm font-medium">Parameters</div>
          <div className="space-y-2">
            {parsedSchema.properties.map((param) => (
              <PropertyDisplay key={param.name} property={param} level={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AvailableToolsCard({
  tools,
  activeTools,
}: {
  tools: MCPTool['availableTools'];
  activeTools: string[] | undefined;
}) {
  if (!tools) return null; // parent component already makes sure to handle this

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="text-sm font-medium leading-none">Available Tools</div>
        <Badge variant="count">{tools.length}</Badge>
      </div>
      <div className="space-y-2">
        {tools.map((availableTool) => {
          const isActive =
            activeTools === undefined ? true : activeTools?.includes(availableTool.name);
          return <ToolCard key={availableTool.name} tool={availableTool} isActive={!!isActive} />;
        })}
      </div>
    </div>
  );
}
