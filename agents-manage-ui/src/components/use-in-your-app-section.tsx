'use client';

import { useMemo } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { ExternalLink } from '@/components/ui/external-link';
import { extractExportedComponentName, toPascalCase } from '@/lib/component-name-utils';

interface UseInYourAppSectionProps {
  componentId: string;
  componentName?: string;
  renderCode?: string;
  docsPath: string;
  docsLabel?: string;
}

const ADD_ONE_CMD = (id: string) => `inkeep add --ui ${id}`;
const ADD_ALL_CMD = 'inkeep add --ui';

function escapeComponentKey(name: string): string {
  return JSON.stringify(name);
}

function buildImportAndRegistrationSnippet(
  pascalCaseFileName: string,
  importedName: string,
  dashboardComponentName: string
): string {
  const componentsKey = escapeComponentKey(dashboardComponentName);
  return `import { ${importedName} } from './ui/${pascalCaseFileName}';

<InkeepSidebarChat
  aiChatSettings={{
    agentUrl: "your-agent-url",
    components: {
      ${componentsKey}: ${importedName},
    },
  }}
/>`;
}

export function UseInYourAppSection({
  componentId,
  componentName = 'YourComponentName',
  renderCode,
  docsPath,
  docsLabel = 'Learn more',
}: UseInYourAppSectionProps) {
  const pascalCaseFileName = useMemo(() => toPascalCase(componentName), [componentName]);
  const importedName = useMemo(
    () => extractExportedComponentName(renderCode ?? '') ?? pascalCaseFileName,
    [renderCode, pascalCaseFileName]
  );
  const addOneCommand = ADD_ONE_CMD(componentId);
  const importAndSnippet = useMemo(
    () => buildImportAndRegistrationSnippet(pascalCaseFileName, importedName, componentName),
    [pascalCaseFileName, importedName, componentName]
  );

  return (
    <div className="mt-4 space-y-4 rounded-md border border-border bg-muted/30 p-4">
      <ol className="list-inside list-decimal space-y-3 text-sm text-muted-foreground">
        <li>
          Run this command in your project to add this component to{' '}
          <div className="relative mt-2">
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 pr-12 text-xs">
              <code>{addOneCommand}</code>
            </pre>
            <div className="absolute end-2 top-2">
              <CopyButton textToCopy={addOneCommand} size="sm" className="h-7 px-2 rounded-sm" />
            </div>
          </div>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            To add all components, run: <code className="rounded bg-muted px-1">{ADD_ALL_CMD}</code>
            <CopyButton textToCopy={ADD_ALL_CMD} size="sm" className="h-5 w-5 shrink-0 p-0" />
          </p>
        </li>
        <li>
          After adding, import and register the component with your chat:
          <div className="relative mt-2">
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 pr-12 text-xs whitespace-pre">
              <code>{importAndSnippet}</code>
            </pre>
            <div className="absolute end-2 top-2">
              <CopyButton textToCopy={importAndSnippet} size="sm" className="h-7 px-2 rounded-sm" />
            </div>
          </div>
        </li>
      </ol>
      <ExternalLink href={docsPath} target="_blank" className="text-xs">
        {docsLabel}
      </ExternalLink>
    </div>
  );
}
