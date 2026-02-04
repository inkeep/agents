import { zodResolver } from '@hookform/resolvers/zod';
import { jsonSchemaToZod } from '@inkeep/agents-core/client-exports';
import { Pencil, Plus } from 'lucide-react';
import { type FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { toJson } from '@/lib/json-schema-validation';
import { customHeadersTemplate } from '@/lib/templates/schema-templates';

const DefaultHeadersSchema = z
  .string()
  .refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }, 'Must be valid JSON object')
  .refine((val) => {
    try {
      const parsed = JSON.parse(val);
      return Object.values(parsed).every((v) => typeof v === 'string');
    } catch {
      return false;
    }
  }, 'All header values must be strings');

interface CustomHeadersDialogProps {
  customHeaders?: Record<string, string>;
  setCustomHeaders: (headers: Record<string, string>) => void;
}

export const CustomHeadersDialog: FC<CustomHeadersDialogProps> = ({
  customHeaders,
  setCustomHeaders,
}) => {
  'use memo';
  const [defaultValues] = useState(() => ({
    headers: JSON.stringify(customHeaders, null, 2) ?? '',
  }));
  const [isOpen, setIsOpen] = useState(true);

  const headersSchemaString = useAgentStore(({ metadata }) => metadata.contextConfig.headersSchema);
  // const headers = headersSchemaString
  //   ? jsonSchemaToZod(JSON.parse(headersSchemaString))
  //   : DefaultHeadersSchema;

  const zodSchema = z.strictObject({
    headers: z
      .string()
      .trim()
      .transform((value, ctx) => (value ? toJson(value, ctx) : null))
      .pipe(
        z.record(
          z.string(),
          z.string('All header values must be strings'),
          'Must be valid JSON object'
        )
      ),
  });

  const form = useForm({
    defaultValues,
    resolver: zodResolver(zodSchema),
  });
  const numHeaders = Object.keys(customHeaders ?? {}).length;

  const onSubmit = form.handleSubmit(async ({ headers }) => {
    let parsedHeaders: Record<string, string> | undefined;
    console.log({ headers });
    // if (headers) {
    //   try {
    //     parsedHeaders = JSON.parse(headers);
    //   } catch (error) {
    //     console.error('Error parsing JSON:', error);
    //     form.setError('headers', {
    //       message: error instanceof Error ? error.message : 'Invalid JSON',
    //     });
    //     return;
    //   }
    // }
    // setCustomHeaders(parsedHeaders || {});
    // toast.success('Custom headers applied, you can now use them in the chat.');
    // setIsOpen(false);
  }, console.error);

  function onRemoveHeaders() {
    form.reset({ headers: '{}' });
    setCustomHeaders({});
    setIsOpen(false);
    toast.success('Custom headers removed.');
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6">
          {numHeaders > 0 ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          Custom Headers
          {numHeaders > 0 && <Badge variant="code">{numHeaders}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom Headers</DialogTitle>
          <DialogDescription>Add custom headers to the chat API requests.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-8">
            <FormFieldWrapper control={form.control} name="headers" label="Custom headers">
              {(field) => (
                <StandaloneJsonEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={customHeadersTemplate}
                  {...field}
                  customTemplate={customHeadersTemplate}
                />
              )}
            </FormFieldWrapper>
            <div className="flex justify-end gap-2">
              {numHeaders > 0 && (
                <Button type="button" variant="outline" onClick={onRemoveHeaders}>
                  Remove headers
                </Button>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Apply
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
