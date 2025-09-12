import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { JsonEditor } from '@/components/form/json-editor';
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

const customHeadersSchema = z.object({
  headers: z
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
    }, 'All header values must be strings'),
});

export type CustomHeadersFormData = z.infer<typeof customHeadersSchema>;

interface CustomHeadersDialogProps {
  customHeaders: Record<string, string>;
  setCustomHeaders: (headers: Record<string, string>) => void;
}

function CustomHeadersDialog({ customHeaders, setCustomHeaders }: CustomHeadersDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const form = useForm<CustomHeadersFormData>({
    defaultValues: {
      headers: JSON.stringify(customHeaders, null, 2),
    },
    resolver: zodResolver(customHeadersSchema),
  });
  const { isSubmitting } = form.formState;

  const onSubmit = async ({ headers }: CustomHeadersFormData) => {
    let parsedHeaders: Record<string, string> | undefined;
    if (headers) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (error) {
        console.error('Error parsing JSON:', error);
        form.setError('headers', {
          message: error instanceof Error ? error.message : 'Invalid JSON',
        });
        return;
      }
    }
    setCustomHeaders(parsedHeaders || {});
    toast.success('Custom headers applied, you can now use them in the chat.');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="w-4 h-4" />
          Custom Headers
        </Button>
      </DialogTrigger>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom Headers</DialogTitle>
          <DialogDescription>Add custom headers to the chat API requests.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormFieldWrapper control={form.control} name="headers" label="Custom headers">
              {(field) => (
                <JsonEditor
                  value={field.value || ''}
                  onChange={field.onChange}
                  placeholder="Enter headers..."
                  {...field}
                />
              )}
            </FormFieldWrapper>
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={isSubmitting}>
                Apply
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CustomHeadersDialog;
