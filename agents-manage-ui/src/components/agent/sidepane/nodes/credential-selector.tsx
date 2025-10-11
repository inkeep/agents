'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Credential } from '@/lib/api/credentials';
import { EmptyState } from './empty-state';

// Header component - shows label and status
interface CredentialHeaderProps {
  label: string;
}

function CredentialHeader({ label }: CredentialHeaderProps) {
  return (
    <div className="flex gap-2">
      <Label>{label}</Label>
    </div>
  );
}

// Dropdown for selecting credentials
interface CredentialDropdownProps {
  selectedCredentialId: string | null;
  onSelect: (credentialId: string | null) => void;
  availableCredentials: Credential[];
  placeholder?: string;
}

function CredentialDropdown({
  selectedCredentialId,
  onSelect,
  availableCredentials,
  placeholder = 'Select credential...',
}: CredentialDropdownProps) {
  const [open, setOpen] = useState(false);
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  return (
    <div className="flex w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-transparent text-gray-700"
          >
            {selectedCredentialId === null ? (
              <div className="text-muted-foreground">No Authentication</div>
            ) : selectedCredentialId ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {availableCredentials.find((c) => c.id === selectedCredentialId)?.id ||
                    selectedCredentialId}
                </span>
                <span className="text-xs text-muted-foreground">
                  (
                  {availableCredentials.find((c) => c.id === selectedCredentialId)?.type ||
                    'Unknown'}
                  )
                </span>
              </div>
            ) : (
              <div className="text-muted-foreground">{placeholder}</div>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Search credentials..." />
            <CommandList>
              <CommandEmpty>
                {' '}
                <EmptyState
                  message={'No credentials found.'}
                  actionText={'Create credential'}
                  actionHref={`/${tenantId}/projects/${projectId}/credentials/new`}
                />
              </CommandEmpty>
              <CommandGroup>
                {/* No Authentication option */}
                <CommandItem
                  value=""
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <div className="font-medium">No Authentication</div>
                      <div className="text-xs text-muted-foreground">Unsecured connection</div>
                    </div>
                    {selectedCredentialId === null && <Check className="ml-2 h-4 w-4" />}
                  </div>
                </CommandItem>

                {/* Available credentials */}
                {availableCredentials.map((credential) => (
                  <CommandItem
                    key={credential.id}
                    value={credential.id}
                    onSelect={() => {
                      onSelect(credential.id);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <div className="font-medium">{credential.id}</div>
                        <div className="text-xs text-muted-foreground">{credential.type}</div>
                      </div>
                      {selectedCredentialId === credential.id && <Check className="ml-2 h-4 w-4" />}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Main selector component
interface CredentialSelectorProps {
  label?: string;
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  credentialLookup: Record<string, Credential>;
}

export function CredentialSelector({
  label = 'Credential',
  value,
  credentialLookup,
  onValueChange,
  placeholder = 'Select credential...',
}: CredentialSelectorProps) {
  const handleSelect = (credentialId: string | null) => {
    onValueChange?.(credentialId);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <CredentialHeader label={label} />
      </div>
      <CredentialDropdown
        selectedCredentialId={value || null}
        onSelect={handleSelect}
        availableCredentials={Object.values(credentialLookup)}
        placeholder={placeholder}
      />
    </div>
  );
}
