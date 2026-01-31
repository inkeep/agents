import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { MCPTool } from '@/lib/types/tools';
import { cn } from '@/lib/utils';
import { parseMCPInputSchema } from '@/lib/utils/mcp-schema-parser';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { PropertyDisplay } from './property-display';

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

function ToolCard({ tool, isActive, override }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // In simple mode, use override if available, otherwise original
  const schemaToDisplay = override?.schema ? override.schema : tool.inputSchema;
  const descriptionToDisplay = override?.description ? override.description : tool.description;

  const parsedSchema = schemaToDisplay ? parseMCPInputSchema(schemaToDisplay) : null;

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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          <Badge
            variant={isActive ? 'primary' : 'code'}
            className={cn(
              'truncate max-w-full inline-block min-w-0 flex-1',
              !isActive && 'bg-transparent text-foreground'
            )}
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
            <Badge variant="violet" className="uppercase">
              Modified
            </Badge>
          )}
        </div>

        {parsedSchema?.hasProperties && (
          <Button variant="ghost" size="icon-sm" onClick={() => setIsExpanded(!isExpanded)}>
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
          <>
            <div className="text-sm font-medium">Parameters</div>
            <div className="space-y-2">
              {parsedSchema?.properties.map((param) => (
                <PropertyDisplay key={param.name} property={param} level={0} />
              ))}
            </div>
          </>
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
  tools: NonNullable<MCPTool['availableTools']>;
  activeTools: string[] | undefined;
  toolOverrides?: Record<
    string,
    {
      displayName?: string;
      description?: string;
      schema?: any;
      transformation?: string | Record<string, string>;
    }
  >;
}) {
  'use memo';
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="text-sm font-medium leading-none">Available Tools</div>
        <Badge variant="count">{tools.length}</Badge>
      </div>
      <div className="space-y-2">
        {tools
          .map((tool) => ({
            ...tool,
            isActive: activeTools?.includes(tool.name) ?? true,
            override: toolOverrides?.[tool.name],
          }))
          .sort((a, b) => {
            if (a.isActive !== b.isActive) {
              return a.isActive ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              isActive={tool.isActive}
              override={tool.override}
            />
          ))}
      </div>
    </div>
  );
}
