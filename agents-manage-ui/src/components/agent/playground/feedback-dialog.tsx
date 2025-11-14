import { zodResolver } from '@hookform/resolvers/zod';
import { SparklesIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
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
import { useCopilotContext } from '../copilot/copilot-context';

interface FeedbackDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
}

const feedbackSchema = z.object({
  feedback: z
    .string()
    .min(1, 'Please provide details about what could have been better.')
    .max(1000, 'Feedback must be less than 1000 characters'),
});

export type FeedbackFormData = z.infer<typeof feedbackSchema>;

export const FeedbackDialog = ({ isOpen, onOpenChange, conversationId }: FeedbackDialogProps) => {
  const { chatFunctionsRef, openCopilot, setConversationId } = useCopilotContext();
  const form = useForm<FeedbackFormData>({
    defaultValues: {
      feedback: '',
    },
    resolver: zodResolver(feedbackSchema),
  });
  const { isSubmitting } = form.formState;

  const onSubmit = async ({ feedback }: FeedbackFormData) => {
    if (chatFunctionsRef?.current) {
      openCopilot();
      setConversationId(conversationId);
      // todo this is a hack to ensure the message is submitted after the conversation id is set
      setTimeout(() => {
        chatFunctionsRef?.current?.submitMessage(feedback);
      }, 100);
    }
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
            <GenericTextarea
              control={form.control}
              name="feedback"
              label=""
              placeholder="What could have been better?"
              className="min-h-[80px]"
            />
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={isSubmitting}>
                <SparklesIcon className="size-4" />
                Fix with Copilot
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
