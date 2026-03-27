'use client';

import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  addAppAuthKeyAction,
  deleteAppAuthKeyAction,
  fetchAppAuthKeysAction,
} from '@/lib/actions/app-auth-keys';
import type { PublicKeyConfig } from '@/lib/api/app-auth-keys';

const ALGORITHM_OPTIONS = [
  { value: 'RS256', label: 'RS256' },
  { value: 'ES256', label: 'ES256' },
  { value: 'EdDSA', label: 'EdDSA' },
] as const;

interface AuthKeysSectionProps {
  tenantId: string;
  projectId: string;
  appId: string;
}

export function AuthKeysSection({ tenantId, projectId, appId }: AuthKeysSectionProps) {
  const [keys, setKeys] = useState<PublicKeyConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingKid, setDeletingKid] = useState<string | null>(null);

  const [kid, setKid] = useState('');
  const [algorithm, setAlgorithm] = useState('RS256');
  const [publicKey, setPublicKey] = useState('');

  const loadKeys = useCallback(async () => {
    const result = await fetchAppAuthKeysAction(tenantId, projectId, appId);
    if (result.success && result.data) {
      setKeys(result.data);
    } else {
      toast.error(result.error || 'Failed to load authentication keys');
    }
    setIsLoading(false);
  }, [tenantId, projectId, appId]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleAdd = async () => {
    if (!kid.trim() || !publicKey.trim()) return;
    setIsAdding(true);
    try {
      const result = await addAppAuthKeyAction(tenantId, projectId, appId, {
        kid: kid.trim(),
        publicKey: publicKey.trim(),
        algorithm,
      });
      if (result.success) {
        toast.success('Public key added');
        setKid('');
        setAlgorithm('RS256');
        setPublicKey('');
        setShowAddForm(false);
        await loadKeys();
      } else {
        toast.error(result.error || 'Failed to add key');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (kidToDelete: string) => {
    setDeletingKid(kidToDelete);
    try {
      const result = await deleteAppAuthKeyAction(tenantId, projectId, appId, kidToDelete);
      if (result.success) {
        toast.success('Public key removed');
        await loadKeys();
      } else {
        toast.error(result.error || 'Failed to remove key');
      }
    } finally {
      setDeletingKid(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Authentication</Label>
        <p className="text-sm text-muted-foreground">Loading keys...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Authentication Keys</Label>
        {!showAddForm && keys.length < 5 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-1 size-3" />
            Add Key
          </Button>
        )}
      </div>

      {keys.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">
          No public keys configured. Add a key to enable authenticated sessions.
        </p>
      )}

      {keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.kid}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono truncate">{key.kid}</span>
                <Badge variant="code">{key.algorithm}</Badge>
                <span className="text-muted-foreground text-xs shrink-0">
                  {new Date(key.addedAt).toLocaleDateString()}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={deletingKid === key.kid}
                onClick={() => handleDelete(key.kid)}
                aria-label={`Remove key ${key.kid}`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="auth-kid" className="text-sm">
              Key ID (kid)
            </Label>
            <Input
              id="auth-kid"
              value={kid}
              onChange={(e) => setKid(e.target.value)}
              placeholder="my-key-1"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-algorithm" className="text-sm">
              Algorithm
            </Label>
            <Select value={algorithm} onValueChange={setAlgorithm}>
              <SelectTrigger id="auth-algorithm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALGORITHM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-public-key" className="text-sm">
              Public Key (PEM)
            </Label>
            <Textarea
              id="auth-public-key"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
              className="font-mono text-xs min-h-24 break-all whitespace-pre-wrap"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setKid('');
                setAlgorithm('RS256');
                setPublicKey('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!kid.trim() || !publicKey.trim() || isAdding}
              onClick={handleAdd}
            >
              {isAdding ? 'Adding...' : 'Add Key'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
