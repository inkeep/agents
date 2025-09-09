import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { MCPTool } from '@/lib/api/tools';
import { getTypeBadgeVariant, parseMCPInputSchema } from '@/lib/utils/mcp-schema-parser';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface ToolCardProps {
  tool: {
    name: string;
    description?: string;
    inputSchema?: any;
  };
}

function ToolCard({ tool }: ToolCardProps) {
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
          <Badge variant="code" className="bg-transparent text-foreground">
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
              <div
                key={param.name}
                className="flex items-center justify-between p-2 bg-muted/30 rounded"
              >
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                    {param.name}
                  </code>
                  {!param.required && (
                    <span className="text-xs text-muted-foreground">optional</span>
                  )}
                </div>
                <Badge variant={getTypeBadgeVariant(param.type)} className="text-xs">
                  {param.type}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AvailableToolsCard({ tools }: { tools: MCPTool['availableTools'] }) {
  if (!tools) return null; // parent component already makes sure to handle this

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="text-sm font-medium leading-none">Available Tools</div>
        <Badge variant="code" className="border-none px-2 text-[10px] text-gray-700">
          {tools.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {tools.map((availableTool) => (
          <ToolCard key={availableTool.name} tool={availableTool} />
        ))}
      </div>
    </div>
  );
}
