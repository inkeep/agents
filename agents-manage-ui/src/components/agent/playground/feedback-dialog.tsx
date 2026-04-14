import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { createFeedbackAction } from '@/lib/actions/feedback';

interface FeedbackDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  conversationId: string;
  messageId?: string;
  initialType?: 'positive' | 'negative';
  onSubmitSuccess?: () => void;
}

const feedbackSchema = z
  .object({
    type: z.enum(['positive', 'negative']),
    feedback: z.string().max(1000, 'Feedback must be less than 1000 characters').optional(),
  })
  .refine((data) => data.type === 'positive' || (data.feedback && data.feedback.length > 0), {
    message: 'Please provide details for negative feedback.',
    path: ['feedback'],
  });

type FeedbackFormData = z.infer<typeof feedbackSchema>;

export const FeedbackDialog = ({
  isOpen,
  onOpenChange,
  tenantId,
  projectId,
  conversationId,
  messageId,
  initialType,
  onSubmitSuccess,
}: FeedbackDialogProps) => {
  const form = useForm<FeedbackFormData>({
    defaultValues: {
      type: initialType ?? 'negative',
      feedback: '',
    },
    resolver: zodResolver(feedbackSchema),
  });
  const { isSubmitting } = form.formState;

  const type = useWatch({ control: form.control, name: 'type' });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        type: initialType ?? 'negative',
        feedback: '',
      });
    }
  }, [form, isOpen, initialType]);

  const onSubmit = async ({ feedback, type }: FeedbackFormData) => {
    try {
      const result = await createFeedbackAction(tenantId, projectId, {
        conversationId,
        messageId,
        type,
        details: feedback || null,
      });

      if (!result.success) {
        toast.error('Failed to save feedback', { description: result.error });
        return;
      }
    } catch (error) {
      toast.error('Failed to save feedback', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      return;
    }

    if (type === 'positive') {
      toast.success('Feedback saved');
      onSubmitSuccess?.();
      onOpenChange(false);
      return;
    }

    toast.success('Feedback saved');
    onSubmitSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <DialogDescription className="sr-only">
            Provide feedback on the message.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <GenericTextarea
              control={form.control}
              name="feedback"
              label={
                type === 'positive'
                  ? 'What did you like about this response?'
                  : 'How can we improve this response?'
              }
              placeholder={'Provide additional details'}
              className="min-h-[80px]"
            />
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={isSubmitting}>
                Submit feedback
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
