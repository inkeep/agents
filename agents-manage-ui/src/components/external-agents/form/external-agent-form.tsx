'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import type { Credential } from '@/lib/api/credentials';
import { createExternalAgent, updateExternalAgent } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { type ExternalAgentFormData, externalAgentSchema } from './validation';

interface ExternalAgentFormProps {
  initialData?: ExternalAgentFormData;
  mode?: 'create' | 'update';
  externalAgent?: ExternalAgent;
  credentials: Credential[];
  tenantId: string;
  projectId: string;
}

const defaultValues: ExternalAgentFormData = {
  name: '',
  description: '',
  baseUrl: '',
  credentialReferenceId: 'none',
};

export function ExternalAgentForm({
  initialData,
  mode = 'create',
  externalAgent,
  credentials,
  tenantId,
  projectId,
}: ExternalAgentFormProps) {
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(externalAgentSchema),
    defaultValues: {
      ...defaultValues,
      ...initialData,
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: ExternalAgentFormData) => {
    try {
      // Transform form data to API format
      const transformedData = {
        ...data,
        description: data.description || '',
        credentialReferenceId:
          data.credentialReferenceId === 'none' ? null : data.credentialReferenceId,
      };

      if (mode === 'update' && externalAgent) {
        await updateExternalAgent(tenantId, projectId, externalAgent.id, transformedData);
        toast.success('External agent updated successfully');
        router.push(`/${tenantId}/projects/${projectId}/external-agents/${externalAgent.id}`);
      } else {
        const newExternalAgent = await createExternalAgent(tenantId, projectId, {
          ...transformedData,
          id: nanoid(),
        });
        toast.success('External agent created successfully');
        router.push(`/${tenantId}/projects/${projectId}/external-agents/${newExternalAgent.id}`);
      }
    } catch (error) {
      console.error(`Failed to ${mode} external agent:`, error);
      toast.error(`Failed to ${mode} external agent. Please try again.`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My External Agent"
          isRequired
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description (optional)"
          placeholder="A brief description of what this external agent does..."
        />
        <GenericInput
          control={form.control}
          name="baseUrl"
          label="Base URL"
          placeholder="https://api.example.com"
          isRequired
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
              ...credentials.map((credential) => ({
                value: credential.id,
                label: credential.id,
              })),
            ]}
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

        <Button type="submit" disabled={isSubmitting}>
          {mode === 'update' ? 'Save' : 'Create'}
        </Button>
      </form>
    </Form>
  );
}
