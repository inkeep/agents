import { CheckCircle2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function InvitationSuccess() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              Welcome!
            </CardTitle>
          </div>
          <CardDescription>
            You've successfully joined the organization. Redirecting...
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
