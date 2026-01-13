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
  override?: {
    displayName?: string;
    description?: string;
    schema?: any;
    transformation?: string | Record<string, string>;
  };
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

function ToolCard({ tool, isActive, override }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // In simple mode, use override if available, otherwise original
  const schemaToDisplay = override?.schema && !showComparison ? override.schema : tool.inputSchema;
  const descriptionToDisplay = override?.description && !showComparison ? override.description : tool.description;
  
  const parsedSchema = schemaToDisplay ? parseMCPInputSchema(schemaToDisplay) : null;
  
  // For comparison mode - parse schemas separately  
  const originalParsedSchema = tool.inputSchema ? parseMCPInputSchema(tool.inputSchema) : null;
  const overrideParsedSchema = override?.schema ? parseMCPInputSchema(override.schema) : null;

  // Truncate description if it's too long
  const maxDescriptionLength = 200;
  const shouldTruncateDescription =
    descriptionToDisplay && descriptionToDisplay.length > maxDescriptionLength;
  const displayDescription =
    shouldTruncateDescription && !showFullDescription
      ? `${descriptionToDisplay?.substring(0, maxDescriptionLength)}...`
      : descriptionToDisplay;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Tool header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant={isActive ? 'primary' : 'code'}
            className={cn(!isActive && 'bg-transparent text-foreground')}
          >
            {override?.displayName || tool.name}
          </Badge>
          {parsedSchema?.hasProperties && (
            <Badge variant="code">
              {parsedSchema.properties.length} parameter
              {parsedSchema.properties.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {override && (
            <Badge 
              variant="destructive" 
              className="text-xs cursor-pointer hover:bg-destructive/80 transition-colors"
              onClick={() => setShowComparison(!showComparison)}
            >
              Override
            </Badge>
          )}
        </div>
        {(descriptionToDisplay || parsedSchema?.hasProperties) && (
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
      {isExpanded && (parsedSchema?.hasProperties || (override && showComparison)) && (
        <div className="space-y-3 pt-2 border-t">
          {!override || !showComparison ? (
            // Simple view - show either override schema or original schema
            <>
              <div className="text-sm font-medium">Parameters</div>
              <div className="space-y-2">
                {parsedSchema?.properties.map((param) => (
                  <PropertyDisplay key={param.name} property={param} level={0} />
                ))}
              </div>
            </>
          ) : (
            // Comparison view - show both schemas and transformation
            <div className="space-y-4">
              {/* Name Changes */}
              {override.displayName && override.displayName !== tool.name && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Name Changes</div>
                  <div className="space-y-2">
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Original:</div>
                      <div className="text-sm font-mono">{tool.name}</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800">
                      <div className="text-xs text-muted-foreground mb-1">Display Name:</div>
                      <div className="text-sm">{override.displayName}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Description Changes */}
              {override.description && override.description !== tool.description && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Description Changes</div>
                  <div className="space-y-2">
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Original:</div>
                      <div className="text-sm">{tool.description || 'No description'}</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800">
                      <div className="text-xs text-muted-foreground mb-1">Override:</div>
                      <div className="text-sm">{override.description}</div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                {/* Original Schema */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Original Parameters</div>
                  <div className="space-y-2 bg-muted/50 p-3 rounded">
                    {originalParsedSchema?.properties.map((param) => (
                      <PropertyDisplay key={`original-${param.name}`} property={param} level={0} />
                    ))}
                  </div>
                </div>
                
                {/* Override Schema */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Override Parameters</div>
                  <div className="space-y-2 bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800">
                    {overrideParsedSchema?.properties.map((param) => (
                      <PropertyDisplay key={`override-${param.name}`} property={param} level={0} />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Transformation */}
              {override.transformation && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Field Mapping</div>
                  <div className="space-y-1 bg-muted p-3 rounded">
                    {typeof override.transformation === 'string' ? (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">JMESPath Expression:</div>
                      <div className="text-xs font-mono bg-background p-2 rounded border">
                        {override.transformation.split(',').map((part, index) => {
                          const trimmed = part.trim();
                          const colonIndex = trimmed.indexOf(':');
                          if (colonIndex > 0) {
                            const field = trimmed.substring(0, colonIndex).trim();
                            const path = trimmed.substring(colonIndex + 1).trim();
                            return (
                              <div key={index} className="flex items-center gap-2">
                                <span className="text-green-600 dark:text-green-400 font-medium">
                                  {field}
                                </span>
                                <span className="text-muted-foreground">←</span>
                                <span className="text-blue-600 dark:text-blue-400 font-medium">
                                  {path}
                                </span>
                              </div>
                            );
                          }
                          return <div key={index} className="text-xs">{trimmed}</div>;
                        })}
                      </div>
                    </div>
                  ) : (
                    Object.entries(override.transformation).map(([overrideField, originalField]) => (
                      <div key={overrideField} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {overrideField}
                        </span>
                        <span className="text-muted-foreground">←</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {originalField}
                        </span>
                      </div>
                    ))
                  )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AvailableToolsCard({
  tools,
  activeTools,
  toolOverrides,
}: {
  tools: MCPTool['availableTools'];
  activeTools: string[] | undefined;
  toolOverrides?: Record<string, {
    displayName?: string;
    description?: string;
    schema?: any;
    transformation?: string | Record<string, string>;
  }>;
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
          const override = toolOverrides?.[availableTool.name];
          return (
            <ToolCard
              key={availableTool.name}
              tool={availableTool}
              isActive={!!isActive}
              override={override}
            />
          );
        })}
      </div>
    </div>
  );
}
