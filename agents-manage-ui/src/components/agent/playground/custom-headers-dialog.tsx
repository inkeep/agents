import type { StringRecordSchema } from '@inkeep/agents-core/client-exports';
import { Pencil, Plus } from 'lucide-react';
import type { FC } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
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
import { customHeadersTemplate } from '@/lib/templates';
import { toast } from '@/lib/toast';

type DefaultHeaders = z.infer<typeof StringRecordSchema>;

interface CustomHeadersDialogProps {
  customHeaders?: DefaultHeaders;
  setCustomHeaders: (headers?: DefaultHeaders) => void;
  form: UseFormReturn<any, any, { headers: DefaultHeaders }>;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const CustomHeadersDialog: FC<CustomHeadersDialogProps> = ({
  customHeaders,
  setCustomHeaders,
  form,
  isOpen,
  setIsOpen,
}) => {
  'use memo';
  const numHeaders = Object.keys(customHeaders ?? {}).length;

  const onSubmit = form.handleSubmit(({ headers }) => {
    setCustomHeaders(headers);
    toast.success('Custom headers applied, you can now use them in the chat.');
    setIsOpen(false);
  });

  function onRemoveHeaders() {
    form.reset();
    setCustomHeaders();
    setIsOpen(false);
    toast.success('Custom headers removed.');
  }
  const hasHeadersError = !!form.formState.errors.headers?.message;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={hasHeadersError ? 'destructive-outline' : 'ghost'}
          size="sm"
          className="h-6"
        >
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
                  placeholder={customHeadersTemplate}
                  customTemplate={customHeadersTemplate}
                  {...field}
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
