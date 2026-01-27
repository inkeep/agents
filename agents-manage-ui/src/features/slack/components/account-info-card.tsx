'use client';

import { User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlack } from '../context/slack-provider';

export function AccountInfoCard() {
  const { user, isLoading } = useSlack();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Account Info
        </CardTitle>
        <CardDescription>Your connected account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mounted || isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : user ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Name</span>
              <span className="text-sm font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Email</span>
              <span className="text-sm font-medium">{user.email}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Status</span>
              <span className="text-sm text-muted-foreground">Auth disabled</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
