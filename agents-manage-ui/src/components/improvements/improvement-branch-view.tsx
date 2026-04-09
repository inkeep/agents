'use client';

import { ArrowLeft, Bot, Check, Loader2, RefreshCw, User, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mergeImprovementAction, rejectImprovementAction } from '@/lib/actions/improvements';
import type { ImprovementDiffResponse } from '@/lib/api/improvements';
import { ImprovementDiffView } from './improvement-diff-view';

interface ConversationMessage {
  role: string;
  content: unknown;
  createdAt?: string;
}

interface ConversationData {
  conversationId: string | null;
  agentStatus?: string;
  messages: ConversationMessage[];
}

interface ImprovementBranchViewProps {
  tenantId: string;
  projectId: string;
  diff: ImprovementDiffResponse;
  branchName: string;
  isNewRun: boolean;
  conversation: ConversationData;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    if (typeof c.text === 'string') return c.text;
    if (Array.isArray(c.parts)) {
      return c.parts
        .map((p: Record<string, unknown>) => (typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n');
    }
  }
  return '';
}

function MessageBubble({ role, content, createdAt }: { role: string; content: unknown; createdAt?: string }) {
  const text = extractText(content);
  if (!text) return null;
  const isAssistant = role === 'assistant';

  return (
    <div className="flex gap-2 items-start">
      <div
        className={`shrink-0 mt-0.5 rounded-full p-1 ${isAssistant ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
      >
        {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground mb-0.5">
          {role}
          {createdAt && (
            <span className="ml-2">
              {new Date(createdAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
        <pre className="text-sm whitespace-pre-wrap break-words font-sans leading-relaxed">
          {text}
        </pre>
      </div>
    </div>
  );
}

export function ImprovementBranchView({
  tenantId,
  projectId,
  diff,
  branchName,
  isNewRun,
  conversation,
}: ImprovementBranchViewProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const agentStatus = conversation.agentStatus;
  const isRunning = agentStatus === 'running' || (isNewRun && !agentStatus);
  const isCompleted = agentStatus === 'completed';
  const isFailed = agentStatus === 'failed';

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 8_000);

    const initialDelay = setTimeout(() => {
      router.refresh();
    }, 3_000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialDelay);
    };
  }, [isRunning, router]);

  const handleRefresh = () => {
    router.refresh();
  };

  const handleMerge = async () => {
    setLoadingAction('merge');
    const result = await mergeImprovementAction(tenantId, projectId, branchName);
    if (result.success) {
      toast.success('Improvement merged successfully');
      router.push(`/${tenantId}/projects/${projectId}/improvements`);
    } else {
      toast.error(result.error ?? 'Failed to merge');
    }
    setLoadingAction(null);
  };

  const handleReject = async () => {
    setLoadingAction('reject');
    const result = await rejectImprovementAction(tenantId, projectId, branchName);
    if (result.success) {
      toast.success('Improvement rejected');
      router.push(`/${tenantId}/projects/${projectId}/improvements`);
    } else {
      toast.error(result.error ?? 'Failed to reject');
    }
    setLoadingAction(null);
  };

  const userMessage = conversation.messages.find((m) => m.role === 'user');
  const lastAssistantMessage = [...conversation.messages]
    .reverse()
    .find((m) => (m.role === 'assistant' || m.role === 'agent') && extractText(m.content));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/${tenantId}/projects/${projectId}/improvements`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Improvements
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          {isRunning && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Agent running...
            </Badge>
          )}
          {isCompleted && (
            <Badge variant="default" className="gap-1.5">
              <Check className="h-3 w-3" />
              Completed
            </Badge>
          )}
          {isFailed && (
            <Badge variant="destructive" className="gap-1.5">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}

          <Button size="sm" variant="ghost" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleMerge}
            disabled={loadingAction !== null || diff.summary.length === 0}
          >
            {loadingAction === 'merge' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Approve & Merge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReject}
            disabled={loadingAction !== null}
          >
            {loadingAction === 'reject' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Reject
          </Button>
        </div>
      </div>

      {(userMessage || lastAssistantMessage) && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Agent Response</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {userMessage && (
              <MessageBubble
                role={userMessage.role}
                content={userMessage.content}
                createdAt={userMessage.createdAt}
              />
            )}
            {lastAssistantMessage ? (
              <MessageBubble
                role={lastAssistantMessage.role}
                content={lastAssistantMessage.content}
                createdAt={lastAssistantMessage.createdAt}
              />
            ) : isRunning ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pl-7">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Agent is working...
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <ImprovementDiffView tenantId={tenantId} projectId={projectId} diff={diff} />
    </div>
  );
}
