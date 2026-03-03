'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  ExternalAgentFormSchema,
  type ExternalAgentInput,
} from '@/components/external-agents/form/validation';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import type { Credential } from '@/lib/api/credentials';
import { createExternalAgent, updateExternalAgent } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { cn, isRequired } from '@/lib/utils';
import { DeleteExternalAgentConfirmation } from '../delete-external-agent-confirmation';

interface ExternalAgentFormProps {
  defaultValues?: ExternalAgentInput;
  externalAgent?: ExternalAgent;
  credentials: Credential[];
  tenantId: string;
  projectId: string;
  className?: string;
}

const initialData: ExternalAgentInput = {
  name: '',
  description: '',
  baseUrl: '',
  credentialReferenceId: 'none',
};

export function ExternalAgentForm({
  defaultValues = initialData,
  externalAgent,
  credentials,
  tenantId,
  projectId,
  className,
}: ExternalAgentFormProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(ExternalAgentFormSchema),
    defaultValues,
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    const mode = externalAgent ? 'update' : 'create';
    try {
      if (externalAgent) {
        await updateExternalAgent(tenantId, projectId, externalAgent.id, data);
        toast.success('External agent updated successfully');
        router.push(`/${tenantId}/projects/${projectId}/external-agents/${externalAgent.id}`);
      } else {
        const newExternalAgent = await createExternalAgent(tenantId, projectId, {
          ...data,
          id: nanoid(),
        });
        toast.success('External agent created successfully');
        router.push(`/${tenantId}/projects/${projectId}/external-agents/${newExternalAgent.id}`);
      }
    } catch (error) {
      console.error(`Failed to ${mode} external agent:`, error);
      toast.error(`Failed to ${mode} external agent. Please try again.`);
    }
  });

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={onSubmit} className={cn('space-y-8', className)}>
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="My External Agent"
            isRequired={isRequired(ExternalAgentFormSchema, 'name')}
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="A brief description of what this external agent does..."
            isRequired={isRequired(ExternalAgentFormSchema, 'description')}
          />
          <GenericInput
            control={form.control}
            name="baseUrl"
            label="Base URL"
            placeholder="https://api.example.com"
            isRequired={isRequired(ExternalAgentFormSchema, 'baseUrl')}
          />

          <div className="space-y-3">
            <GenericSelect
              control={form.control}
              selectTriggerClassName="w-full"
              name="credentialReferenceId"
              label="Credential"
              placeholder="Select a credential"
              options={[
                { value: 'none', label: 'No Authentication' },
                ...credentials.map((credential) => {
                  const displayName = credential.name || credential.id;
                  const hasDuplicateName = credentials.some(
                    (c) => c.id !== credential.id && c.name === credential.name
                  );
                  return {
                    value: credential.id,
                    label:
                      hasDuplicateName || !credential.name
                        ? `${displayName} (${credential.id.slice(0, 8)})`
                        : credential.name,
                  };
                }),
              ]}
              isRequired={isRequired(ExternalAgentFormSchema, 'credentialReferenceId')}
            />
            <InfoCard title="How this works">
              <div className="space-y-2">
                <p>
                  Select{' '}
                  <code className="bg-background px-1.5 py-0.5 rounded border">
                    No Authentication
                  </code>{' '}
                  if the external agent does not require authentication, or if you want to add a
                  credential later.
                </p>
                <p>
                  Otherwise, select from the existing credentials you have already created. The
                  credential will be used when communicating with this external agent.
                </p>
              </div>
            </InfoCard>
          </div>
          <div className="flex w-full justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {externalAgent ? 'Save' : 'Create'}
            </Button>
            {externalAgent && (
              <DialogTrigger asChild>
                <Button type="button" variant="destructive-outline">
                  Delete External Agent
                </Button>
              </DialogTrigger>
            )}
          </div>
        </form>
      </Form>
      {isDeleteOpen && externalAgent && (
        <DeleteExternalAgentConfirmation
          externalAgentId={externalAgent.id}
          externalAgentName={externalAgent.name}
          setIsOpen={setIsDeleteOpen}
          redirectOnDelete
        />
      )}
    </Dialog>
  );
}
