'use client';

import { InkeepEmbeddedChat } from '@inkeep/agents-ui';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { INKEEP_BRAND_COLOR } from '@/constants/theme';
import { fetchConversationHistoryVercelAction } from '@/lib/actions/conversations';
import type { VercelMessage } from '@/lib/api/conversations-client';
import { css } from '@/lib/utils';

const replayStyles = {
  key: 'replay-overrides',
  type: 'style' as const,
  value: css`
    .ikp-ai-chat-footer {
      display: none;
    }
    .upvote,
    .downvote {
      display: none;
    }
  `,
};

interface ConversationTranscriptProps {
  tenantId: string;
  projectId: string;
  conversationId: string;
}

type FetchedConversation = NonNullable<
  NonNullable<
    React.ComponentProps<typeof InkeepEmbeddedChat>['aiChatSettings']
  >['fetchedConversation']
>;

export function ConversationTranscript({
  tenantId,
  projectId,
  conversationId,
}: ConversationTranscriptProps) {
  const [messages, setMessages] = useState<VercelMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchConversationHistoryVercelAction(
          tenantId,
          projectId,
          conversationId
        );
        if (result.success && result.data) {
          setMessages(result.data.messages);
        } else {
          setError(result.error ?? 'Failed to load conversation');
        }
      } catch (err) {
        console.error('[ConversationTranscript] Failed to load conversation', err);
        setError('Failed to load conversation. Please refresh the page.');
      }
      setLoading(false);
    }
    load();
  }, [tenantId, projectId, conversationId]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-muted-foreground">{error}</div>;
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No messages in this conversation.</div>
    );
  }

  return (
    <div className="h-full">
      <InkeepEmbeddedChat
        variant="no-shadow"
        baseSettings={{
          primaryBrandColor: INKEEP_BRAND_COLOR,
          theme: {
            styles: [replayStyles],
          },
        }}
        aiChatSettings={{
          baseUrl: '',
          conversationId,
          fetchedConversation: messages as unknown as FetchedConversation,
          isViewOnly: true,
          isChatHistoryButtonVisible: false,
        }}
      />
    </div>
  );
}
