import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SignupFormProps {
  email: string;
  isSubmitting: boolean;
  onSubmit: (name: string, password: string) => void;
}

export function SignupForm({ email, isSubmitting, onSubmit }: SignupFormProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled className="bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isSubmitting}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isSubmitting}
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting || !name || !password}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating account...
          </>
        ) : (
          'Create Account & Join'
        )}
      </Button>
    </form>
  );
}
