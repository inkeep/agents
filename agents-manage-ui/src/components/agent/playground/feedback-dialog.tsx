import { zodResolver } from '@hookform/resolvers/zod';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createFeedbackAction } from '@/lib/actions/feedback';

interface FeedbackDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  conversationId: string;
  messageId?: string;
  onNegativeFeedbackSubmit?: (feedback: string) => void;
}

const feedbackSchema = z
  .object({
    type: z.enum(['positive', 'negative']),
    scope: z.enum(['message', 'conversation']),
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
  onNegativeFeedbackSubmit,
}: FeedbackDialogProps) => {
  const form = useForm<FeedbackFormData>({
    defaultValues: {
      type: 'negative',
      scope: messageId ? 'message' : 'conversation',
      feedback: '',
    },
    resolver: zodResolver(feedbackSchema),
  });
  const { isSubmitting } = form.formState;

  const type = form.watch('type');
  const scope = form.watch('scope');

  useEffect(() => {
    if (isOpen) {
      form.reset({
        type: 'negative',
        scope: messageId ? 'message' : 'conversation',
        feedback: '',
      });
    }
  }, [form, isOpen, messageId]);

  const onSubmit = async ({ feedback, type, scope }: FeedbackFormData) => {
    if (scope === 'message' && !messageId) {
      toast.error('Message feedback unavailable', {
        description: 'No messageId was provided for this feedback action.',
      });
      return;
    }

    try {
      const result = await createFeedbackAction(tenantId, projectId, {
        conversationId,
        messageId: scope === 'message' ? messageId : undefined,
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
      onOpenChange(false);
      return;
    }

    if (feedback) onNegativeFeedbackSubmit?.(feedback);
    toast.success('Feedback saved');
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl!">
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <DialogDescription className="sr-only">
            Provide feedback on the message.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <FormFieldWrapper control={form.control} name="type" label="Sentiment">
                {(field) => (
                  <FormControl>
                    <div role="group" aria-label="Sentiment" className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={field.value === 'positive' ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={field.value === 'positive'}
                        onClick={() => field.onChange('positive')}
                        className="gap-2"
                      >
                        <ThumbsUp className="size-4" />
                        <span className="sr-only">Thumbs up</span>
                        Like
                      </Button>
                      <Button
                        type="button"
                        variant={field.value === 'negative' ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={field.value === 'negative'}
                        onClick={() => field.onChange('negative')}
                        className="gap-2"
                      >
                        <ThumbsDown className="size-4" />
                        <span className="sr-only">Thumbs down</span>
                        Dislike
                      </Button>
                    </div>
                  </FormControl>
                )}
              </FormFieldWrapper>

              <FormFieldWrapper control={form.control} name="scope" label="Scope">
                {(field) => (
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex items-center gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="message"
                          id="feedback-scope-message"
                          disabled={!messageId}
                        />
                        <Label htmlFor="feedback-scope-message">This message</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="conversation" id="feedback-scope-conversation" />
                        <Label htmlFor="feedback-scope-conversation">Entire conversation</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                )}
              </FormFieldWrapper>
            </div>

            <GenericTextarea
              control={form.control}
              name="feedback"
              label=""
              placeholder={
                type === 'positive'
                  ? scope === 'conversation'
                    ? 'What went well in this conversation?'
                    : 'What went well in this message?'
                  : scope === 'conversation'
                    ? 'What could have been better in this conversation?'
                    : 'What could have been better in this message?'
              }
              className="min-h-[80px]"
            />
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {type === 'negative' ? (
                  <ThumbsDown className="size-4" />
                ) : (
                  <ThumbsUp className="size-4" />
                )}
                Submit feedback
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
