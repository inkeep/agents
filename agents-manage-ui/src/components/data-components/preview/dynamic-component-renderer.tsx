'use client';

import * as LucideIcons from 'lucide-react';
import { useMemo } from 'react';
import { useRunner } from 'react-runner';
import { Alert, AlertDescription } from '@/components/ui/alert';

const { AlertCircle } = LucideIcons;

interface DynamicComponentRendererProps {
  code: string;
  props: Record<string, unknown>;
}

const transformCode = (code: string, props: Record<string, unknown>) => {
  // Extract component name from code using regex, handling both function and arrow function syntax
  const componentNameMatch = code.match(
    /(?:export\s+(?:default\s+)?)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\(.*\)\s*=>|\(\)))/
  );
  const componentName = componentNameMatch?.[1] || componentNameMatch?.[2] || 'App';

  return `
  ${code}
  export default function App() {
    const props = ${JSON.stringify(props)};
    return <${componentName} {...props} />;
  }`;
};

export function DynamicComponentRenderer({ code, props }: DynamicComponentRendererProps) {
  const transformedCode = useMemo(() => transformCode(code, props), [code, props]);
  const scope = useMemo(
    () => ({
      props,
      import: {
        'lucide-react': LucideIcons,
      },
    }),
    [props]
  );

  const { element, error } = useRunner({
    code: transformedCode,
    scope,
  });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="font-mono text-xs">
          Error rendering component: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return <div>{element}</div>;
}
