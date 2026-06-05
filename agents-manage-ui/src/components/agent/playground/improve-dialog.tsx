import { zodResolver } from '@hookform/resolvers/zod';
import { SparklesIcon } from 'lucide-react';
import type { Dispatch } from 'react';
import { useForm } from 'react-hook-form';
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
import { useCopilotContext } from '@/contexts/copilot';

interface ImproveDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  messageId?: string;
  setShowTraces: Dispatch<boolean>;
}

const improveSchema = z.object({
  feedback: z
    .string()
    .min(1, 'Please provide details about what could have been better.')
    .max(1000, 'Feedback must be less than 1000 characters'),
});

type ImproveFormData = z.infer<typeof improveSchema>;

export const ImproveDialog = ({
  isOpen,
  onOpenChange,
  conversationId,
  messageId,
  setShowTraces,
}: ImproveDialogProps) => {
  const {
    chatFunctionsRef: chatFunctionsREF,
    openCopilot,
    setDynamicHeaders,
  } = useCopilotContext();
  const form = useForm<ImproveFormData>({
    defaultValues: {
      feedback: '',
    },
    resolver: zodResolver(improveSchema),
  });
  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ feedback }) => {
    if (chatFunctionsREF.current) {
      openCopilot();
      setShowTraces(false);
      setDynamicHeaders({ conversationId, messageId });
      // todo this is a hack to ensure the message is submitted after the conversation id is set
      setTimeout(() => {
        chatFunctionsREF.current?.submitMessage(feedback);
      }, 100);
      onOpenChange(false);
    } else {
      toast.error('Copilot is not ready', {
        description: 'Please try again in a moment.',
      });
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl!">
        <DialogHeader>
          <DialogTitle>Improve with AI</DialogTitle>
          <DialogDescription className="sr-only">
            Describe how this response should be improved. Your input will be sent to the copilot.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-8">
            <GenericTextarea
              control={form.control}
              name="feedback"
              label="What could have been better?"
              placeholder="Describe how this response should be improved"
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
