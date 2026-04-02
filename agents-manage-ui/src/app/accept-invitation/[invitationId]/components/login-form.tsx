import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginFormProps {
  email: string;
  isSubmitting: boolean;
  showForgotPassword: boolean;
  onSubmit: (password: string) => void;
}

export function LoginForm({ email, isSubmitting, showForgotPassword, onSubmit }: LoginFormProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isSubmitting}
          autoFocus
        />
        {showForgotPassword && (
          <Link
            href={`/forgot-password?email=${encodeURIComponent(email)}`}
            className="block text-right text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Forgot password?
          </Link>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting || !password}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In & Join'
        )}
      </Button>
    </form>
  );
}
