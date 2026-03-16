'use client';

import { ExternalLink, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Credential } from '@/lib/api/credentials';
import { createMCPTool } from '@/lib/api/tools';
import { BUILT_IN_MCP_URL_PREFIX, WEB_SEARCH_PROVIDERS } from '@/lib/data/built-in-mcps';
import { generateId } from '@/lib/utils/id-utils';

interface WebSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: Credential[];
  tenantId: string;
  projectId: string;
  onSuccess: (toolId: string) => void;
}

export function WebSearchDialog({
  open,
  onOpenChange,
  credentials,
  tenantId,
  projectId,
  onSuccess,
}: WebSearchDialogProps) {
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedCredentialId, setSelectedCredentialId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProvider = WEB_SEARCH_PROVIDERS.find((p) => p.id === selectedProviderId);
  const requiresCredential = selectedProvider
    ? 'requiresCredential' in selectedProvider && selectedProvider.requiresCredential
    : false;
  const hasCredentials = credentials.length > 0;
  const canSubmit = !!selectedProviderId && (!requiresCredential || !!selectedCredentialId);

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    setSelectedCredentialId('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedProviderId('');
      setSelectedCredentialId('');
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!selectedProvider || !canSubmit) return;
    setIsSubmitting(true);
    try {
      const newTool = await createMCPTool(tenantId, projectId, {
        id: generateId(),
        name: `${selectedProvider.name} Web Search`,
        config: {
          type: 'mcp' as const,
          mcp: {
            server: { url: `${BUILT_IN_MCP_URL_PREFIX}${selectedProvider.id}` },
            transport: { type: 'streamable_http' },
          },
        },
        credentialReferenceId: selectedCredentialId || null,
        credentialScope: 'project',
        imageUrl: selectedProvider.imageUrl,
      });
      toast.success(`${selectedProvider.name} Web Search added successfully`);
      handleOpenChange(false);
      onSuccess(newTool.id);
    } catch (error) {
      console.error('Failed to create web search MCP:', error);
      toast.error('Failed to add web search. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Add Web Search
          </DialogTitle>
          <DialogDescription>
            Choose a search provider to give your agent web search capabilities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="search-provider-select">Provider</Label>
            <Select value={selectedProviderId} onValueChange={handleProviderChange}>
              <SelectTrigger id="search-provider-select" className="w-full">
                <SelectValue placeholder="Select a provider..." />
              </SelectTrigger>
              <SelectContent>
                {WEB_SEARCH_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                    {'requiresCredential' in provider && provider.requiresCredential
                      ? ''
                      : ' (no API key required)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {requiresCredential && (
            <div className="space-y-2">
              <Label htmlFor="search-credential-select">API Key Credential</Label>
              {hasCredentials ? (
                <Select value={selectedCredentialId} onValueChange={setSelectedCredentialId}>
                  <SelectTrigger id="search-credential-select" className="w-full">
                    <SelectValue placeholder="Select a credential..." />
                  </SelectTrigger>
                  <SelectContent>
                    {credentials.map((credential) => {
                      const displayName = credential.name || credential.id;
                      const hasDuplicateName = credentials.some(
                        (c) => c.id !== credential.id && c.name === credential.name
                      );
                      return (
                        <SelectItem key={credential.id} value={credential.id}>
                          {hasDuplicateName || !credential.name
                            ? `${displayName} (${credential.id.slice(0, 8)})`
                            : credential.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border bg-muted/50 p-3 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">No credentials found.</p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/${tenantId}/projects/${projectId}/credentials/new`}>
                      Create one
                      <ExternalLink className="size-3 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
            {isSubmitting ? 'Adding...' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
