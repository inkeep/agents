'use client';

import { AlertTriangle, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface PendingKey {
  kid: string;
  publicKey: string;
  algorithm: string;
}

export interface PublicKeyDisplay {
  kid: string;
  publicKey: string;
  algorithm: string;
  addedAt?: string;
}

const ALGORITHM_OPTIONS = [
  { value: 'RS256', label: 'RS256' },
  { value: 'ES256', label: 'ES256' },
  { value: 'EdDSA', label: 'EdDSA' },
] as const;

interface AuthKeysSectionProps {
  keys: PublicKeyDisplay[];
  requireAuth: boolean;
  onKeysChange: (keys: PublicKeyDisplay[]) => void;
  onRequireAuthChange: (requireAuth: boolean) => void;
  pendingKeysToAdd: PendingKey[];
  onPendingKeysToAddChange: (keys: PendingKey[]) => void;
  kidsToDelete: string[];
  onKidsToDeleteChange: (kids: string[]) => void;
}

export function AuthKeysSection({
  keys,
  requireAuth,
  onKeysChange,
  onRequireAuthChange,
  pendingKeysToAdd,
  onPendingKeysToAddChange,
  kidsToDelete,
  onKidsToDeleteChange,
}: AuthKeysSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [kid, setKid] = useState('');
  const [algorithm, setAlgorithm] = useState('RS256');
  const [publicKey, setPublicKey] = useState('');

  const visibleKeys = keys.filter((k) => !kidsToDelete.includes(k.kid));
  const allDisplayKeys = [
    ...visibleKeys,
    ...pendingKeysToAdd.map((k) => ({ ...k, addedAt: undefined })),
  ];

  const handleAdd = () => {
    if (!kid.trim() || !publicKey.trim()) return;

    const allKids = [...allDisplayKeys.map((k) => k.kid)];
    if (allKids.includes(kid.trim())) {
      toast.error(`A key with ID "${kid.trim()}" already exists`);
      return;
    }

    onPendingKeysToAddChange([
      ...pendingKeysToAdd,
      { kid: kid.trim(), publicKey: publicKey.trim(), algorithm },
    ]);
    setKid('');
    setAlgorithm('RS256');
    setPublicKey('');
    setShowAddForm(false);
  };

  const handleDelete = (kidToDelete: string) => {
    const isPending = pendingKeysToAdd.some((k) => k.kid === kidToDelete);
    if (isPending) {
      onPendingKeysToAddChange(pendingKeysToAdd.filter((k) => k.kid !== kidToDelete));
    } else {
      onKidsToDeleteChange([...kidsToDelete, kidToDelete]);
    }
    onKeysChange(keys);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Authentication Keys</Label>
        {!showAddForm && (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-1 size-3" />
            Add Key
          </Button>
        )}
      </div>

      {allDisplayKeys.length === 0 && !showAddForm && (
        <p className="text-sm text-muted-foreground">
          No public keys configured. Add a key to enable authenticated sessions.
        </p>
      )}

      {allDisplayKeys.length > 0 && (
        <TooltipProvider delayDuration={300}>
          <div className="space-y-2">
            {allDisplayKeys.map((key) => (
              <div
                key={key.kid}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        navigator.clipboard.writeText(key.publicKey);
                        toast.success('Public key copied to clipboard');
                      }}
                    >
                      <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-mono truncate">{key.kid}</span>
                      <Badge variant="code">{key.algorithm}</Badge>
                      {key.addedAt && (
                        <span className="text-muted-foreground text-xs shrink-0">
                          {new Date(key.addedAt).toLocaleDateString()}
                        </span>
                      )}
                      {!key.addedAt && (
                        <Badge variant="outline" className="text-xs">
                          New
                        </Badge>
                      )}
                      <Copy className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-md">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {key.publicKey}
                    </pre>
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(key.kid)}
                  aria-label={`Remove key ${key.kid}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        </TooltipProvider>
      )}

      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="require-auth" className="text-sm">
            Require Authentication
          </Label>
          <p className="text-xs text-muted-foreground">
            When enabled, all users must present a valid signed JWT. Anonymous access is blocked.
          </p>
        </div>
        <Switch id="require-auth" checked={requireAuth} onCheckedChange={onRequireAuthChange} />
      </div>

      {requireAuth && allDisplayKeys.length === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            Authentication is required but no public keys are configured. All requests will be
            rejected until at least one key is added.
          </span>
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
              disabled={!kid.trim() || !publicKey.trim()}
              onClick={handleAdd}
            >
              Add Key
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
