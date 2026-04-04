'use client';

import * as LucideIcons from 'lucide-react';
import { useMemo } from 'react';
import * as ErrorBoundary from 'react-error-boundary';
import { useRunner } from 'react-runner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const { AlertCircle } = LucideIcons;

interface DynamicComponentRendererProps {
  code: string;
  props: Record<string, unknown>;
}

const js = String.raw;
const transformCode = (code: string, props: Record<string, unknown>) => {
  // Extract component name from code using regex, handling both function and arrow function syntax
  const componentNameMatch = code.match(
    /(?:export\s+(?:default\s+)?)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\(.*\)\s*=>|\(\)))/
  );
  const componentName = componentNameMatch?.[1] || componentNameMatch?.[2] || 'App';

  return js`
  import { ErrorBoundary } from "react-error-boundary";

  ${code}

  export default function App() {
    const props = ${JSON.stringify(props)};
    return (
      <ErrorBoundary fallbackRender={fallbackRender}>
        <${componentName} {...props} />
      </ErrorBoundary>
    );
  }`;
};

function fallbackRender({ error }: { error: Error }) {
  // Parse error to get better formatting
  const errorString = String(error);
  const errorLines = errorString.split('\n');
  const errorMessage = errorLines[0] || errorString;
  const errorStack = errorLines.slice(1).join('\n');

  return (
    <Alert variant="destructive" className="max-w-full">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="font-semibold text-sm">{errorStack}</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <div className="font-mono text-xs break-words">{errorMessage}</div>
      </AlertDescription>
    </Alert>
  );
}

export function DynamicComponentRenderer({ code, props }: DynamicComponentRendererProps) {
  const transformedCode = useMemo(() => transformCode(code, props), [code, props]);
  const scope = useMemo(
    () => ({
      fallbackRender,
      import: {
        'lucide-react': LucideIcons,
        'react-error-boundary': ErrorBoundary,
      },
    }),
    []
  );

  const { element } = useRunner({
    code: transformedCode,
    scope,
  });

  return <div>{element}</div>;
}
