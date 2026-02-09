import type { McpToolDefinition, ToolSimplifyConfig } from '@inkeep/agents-core';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { parseMCPInputSchema } from '@/lib/utils/mcp-schema-parser';
import { PropertyDisplay } from '../property-display';

interface ToolOverrideDiffProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  override: ToolSimplifyConfig;
  originalTool: McpToolDefinition;
}

function CompareRow({
  label,
  hasChange = false,
  originalContent,
  modifiedContent,
}: {
  label: string;
  hasChange?: boolean;
  originalContent: ReactNode;
  modifiedContent: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hasChange && (
          <Badge variant="violet" className="uppercase">
            Modified
          </Badge>
        )}
      </div>
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-4">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 block font-mono">
            Original
          </span>
          {originalContent}
        </div>
        <div className="p-4 bg-muted/40 dark:bg-white/5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 block font-mono">
            Modified
          </span>
          {modifiedContent}
        </div>
      </div>
    </div>
  );
}

function TextContent({ value, isCode = false }: { value: string | null; isCode?: boolean }) {
  if (!value) {
    return <span className="text-sm text-muted-foreground italic">Empty</span>;
  }
  if (isCode) {
    return (
      <code className="text-sm font-mono bg-muted/80 px-2 py-1 border rounded-sm inline-block">
        {value}
      </code>
    );
  }
  return <p className="text-sm text-foreground/80 break-words">{value}</p>;
}

export function ToolOverrideDiff({
  isOpen,
  setIsOpen,
  override,
  originalTool,
}: ToolOverrideDiffProps) {
  const {
    name: originalName,
    description: originalDescription,
    inputSchema: originalInputSchema,
  } = originalTool;
  const {
    displayName: overrideName,
    description: overrideDescription,
    schema: overrideSchema,
  } = override;

  const originalParsedSchema = originalInputSchema
    ? parseMCPInputSchema(originalInputSchema)
    : null;
  const overrideParsedSchema = overrideSchema ? parseMCPInputSchema(overrideSchema) : null;

  const hasNameChange = !!overrideName && overrideName !== originalName;
  const hasDescriptionChange = !!overrideDescription && overrideDescription !== originalDescription;
  const hasSchemaChange = overrideSchema != null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-6xl!">
        <DialogHeader>
          <DialogTitle>Compare</DialogTitle>
          <DialogDescription>Compare the original tool with the modified tool.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <CompareRow
            label="Name"
            hasChange={hasNameChange}
            originalContent={<TextContent value={originalName || null} isCode />}
            modifiedContent={<TextContent value={overrideName || originalName || null} isCode />}
          />
          <CompareRow
            label="Description"
            hasChange={hasDescriptionChange}
            originalContent={<TextContent value={originalDescription || null} />}
            modifiedContent={
              <TextContent value={overrideDescription || originalDescription || null} />
            }
          />
          <CompareRow
            label="Parameters"
            hasChange={hasSchemaChange}
            originalContent={
              <div className="space-y-2">
                {originalParsedSchema?.properties.map((param) => (
                  <PropertyDisplay key={`original-${param.name}`} property={param} level={0} />
                ))}
                {!originalParsedSchema?.hasProperties && (
                  <span className="text-sm text-muted-foreground italic">No parameters</span>
                )}
              </div>
            }
            modifiedContent={
              <div className="space-y-2">
                {(overrideParsedSchema || originalParsedSchema)?.properties.map((param) => (
                  <PropertyDisplay key={`modified-${param.name}`} property={param} level={0} />
                ))}
                {!(overrideParsedSchema || originalParsedSchema)?.hasProperties && (
                  <span className="text-sm text-muted-foreground italic">No parameters</span>
                )}
              </div>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
