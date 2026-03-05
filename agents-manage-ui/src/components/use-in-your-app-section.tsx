'use client';

import { useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperTitle,
} from '@/components/ui/stepper';
import { extractExportedComponentName, toPascalCase } from '@/lib/component-name-utils';

type ComponentKind = 'data' | 'artifact';

interface UseInYourAppSectionProps {
  componentId: string;
  componentName?: string;
  componentKind?: ComponentKind;
  renderCode?: string;
}

const ADD_ONE_CMD = (id: string) => `inkeep add --ui ${id}`;
const ADD_ALL_CMD = 'inkeep add --ui';

function escapeComponentKey(name: string): string {
  return JSON.stringify(name);
}

function buildImportAndRegistrationSnippet(
  pascalCaseFileName: string,
  importedName: string,
  dashboardComponentName: string,
  kind: ComponentKind
): string {
  const key = escapeComponentKey(dashboardComponentName);
  const prop = kind === 'artifact' ? 'artifacts' : 'components';
  return `import { ${importedName} } from './ui/${pascalCaseFileName}';

<InkeepSidebarChat
  aiChatSettings={{
    agentUrl: "your-agent-url",
    ${prop}: {
      ${key}: ${importedName},
    },
  }}
/>`;
}

export function UseInYourAppSection({
  componentId,
  componentName = 'YourComponentName',
  componentKind = 'data',
  renderCode,
}: UseInYourAppSectionProps) {
  const pascalCaseFileName = useMemo(() => toPascalCase(componentName), [componentName]);
  const importedName = useMemo(
    () => extractExportedComponentName(renderCode ?? '') ?? pascalCaseFileName,
    [renderCode, pascalCaseFileName]
  );
  const addOneCommand = ADD_ONE_CMD(componentId);
  const importAndSnippet = useMemo(
    () =>
      buildImportAndRegistrationSnippet(
        pascalCaseFileName,
        importedName,
        componentName,
        componentKind
      ),
    [pascalCaseFileName, importedName, componentName, componentKind]
  );

  return (
    <div className="mt-4">
      <Stepper>
        <StepperItem>
          <StepperIndicator>1</StepperIndicator>
          <StepperContent>
            <StepperTitle>Install the component</StepperTitle>
            <StepperDescription>
              Run this in your project:
              <div className="mt-1.5">
                <CopyableSingleLineCode code={addOneCommand} />
              </div>
              <p className="mt-1.5 flex items-center gap-2">
                To add all components, run: <CopyableSingleLineCode code={ADD_ALL_CMD} />
              </p>
            </StepperDescription>
          </StepperContent>
        </StepperItem>
        <StepperItem>
          <StepperIndicator>2</StepperIndicator>
          <StepperContent>
            <StepperTitle>Add the component to your chat settings</StepperTitle>
            <StepperDescription>
              <Streamdown>
                {`\`\`\`jsx
${importAndSnippet}
\`\`\``}
              </Streamdown>
            </StepperDescription>
          </StepperContent>
        </StepperItem>
      </Stepper>
    </div>
  );
}
