'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlack } from '../context/slack-provider';

export function RawDataPreviewCard() {
  const { workspaces, userLinks } = useSlack();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Raw Data Preview</CardTitle>
        <CardDescription>
          This shows what the database schema would look like. Data is currently in localStorage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!mounted ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-muted rounded w-full" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Workspaces</h4>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-60 text-xs">
                {JSON.stringify(workspaces, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">User Links</h4>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-60 text-xs">
                {JSON.stringify(userLinks, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
