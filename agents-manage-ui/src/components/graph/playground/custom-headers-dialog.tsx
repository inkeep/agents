import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { JsonEditor } from '@/components/form/json-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';

interface CustomHeadersDialogProps {
  customHeaders: Record<string, string>;
  setCustomHeaders: (headers: Record<string, string>) => void;
}

interface CustomHeadersFormData {
  headers: string;
}

function CustomHeadersDialog({ customHeaders, setCustomHeaders }: CustomHeadersDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const form = useForm<CustomHeadersFormData>({
    defaultValues: {
      headers: JSON.stringify(customHeaders, null, 2),
    },
  });
  const { isSubmitting } = form.formState;

  const onSubmit = async ({ headers }: CustomHeadersFormData) => {
    let parsedHeaders: Record<string, string> | undefined;
    if (headers) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (error) {
        console.error('Error parsing JSON:', error);
        form.setError('headers', { message: 'Invalid JSON' });
        return;
      }
    }
    setCustomHeaders(parsedHeaders || {});
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
        <DialogTitle>Custom Headers</DialogTitle>
        <DialogDescription>Add custom headers to the chat API requests.</DialogDescription>
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
