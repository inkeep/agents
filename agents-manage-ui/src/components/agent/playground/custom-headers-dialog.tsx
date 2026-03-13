import type { StringRecordSchema } from '@inkeep/agents-core/client-exports';
import { Pencil, Plus } from 'lucide-react';
import type { FC } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ErrorIndicator } from '@/components/agent/error-display/error-indicator';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
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
import { Form, flatNestedFieldMessage } from '@/components/ui/form';
import { customHeadersTemplate } from '@/lib/templates';
import { cn } from '@/lib/utils';

type DefaultHeaders = z.infer<typeof StringRecordSchema>;

interface CustomHeadersDialogProps {
  customHeaders?: DefaultHeaders;
  setCustomHeaders: (headers?: DefaultHeaders) => void;
  form: UseFormReturn<{ headers: string }, unknown, { headers: DefaultHeaders }>;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const CustomHeadersDialog: FC<CustomHeadersDialogProps> = ({
  customHeaders = {},
  setCustomHeaders,
  form,
  isOpen,
  setIsOpen,
}) => {
  'use memo';
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
  const { isSubmitting, errors } = form.formState;
  const fieldErrors = errors.headers ?? {};

  const processedErrors = Object.entries(fieldErrors).map(([key, value]) => ({
    field: key,
    message: flatNestedFieldMessage(value),
  }));
  const numHeaders = Object.keys(customHeaders).length;

  const hasErrors = processedErrors.length > 0;
  const hasHeaders = numHeaders > 0;
  const IconToUse = hasHeaders ? Pencil : Plus;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-6 relative', hasErrors && 'ring-2 text-red-300! border-current! border')}
        >
          <IconToUse />
          Custom Headers
          {hasHeaders && <Badge variant="code">{numHeaders}</Badge>}
          {hasErrors && <ErrorIndicator errors={processedErrors} />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom Headers</DialogTitle>
          <DialogDescription>Add custom headers to the chat API requests.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-8">
            <GenericJsonEditor
              control={form.control}
              name="headers"
              label="Custom headers"
              placeholder={customHeadersTemplate}
              customTemplate={customHeadersTemplate}
            />
            <div className="flex justify-end gap-2">
              {hasHeaders && (
                <Button type="button" variant="outline" onClick={onRemoveHeaders}>
                  Remove headers
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                Apply
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
