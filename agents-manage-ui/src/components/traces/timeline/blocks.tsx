import { AnthropicIcon } from '@/components/icons/anthropic';
import { OpenAIIcon } from '@/components/icons/openai';
import { Badge } from '@/components/ui/badge';
import type { ActivityItem } from './types';

export function LabeledBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function Divider() {
  return <div className="mt-6 border-t border-border pt-4" />;
}

export function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-foreground">{label}</div>
      <p className="text-sm text-foreground mt-1">{value ?? '-'}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: ActivityItem['status'] }) {
  console.log(status);
  return (
    <div>
      <span className="text-sm font-medium text-foreground">Status</span>
      <div className="mt-1">
        <Badge className="uppercase" variant={status === 'success' ? 'primary' : 'error'}>
          {status}
        </Badge>
      </div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono font-medium text-foreground">{value ?? '-'}</span>
    </div>
  );
}

export function ModelBadge({ model }: { model: string }) {
  return (
    <Badge className="text-xs max-w-full flex-1" variant="code">
      {model?.startsWith('gpt-') ? (
        <OpenAIIcon className="size-3 text-xs text-muted-foreground flex-shrink-0" />
      ) : model?.startsWith('claude-') ? (
        <AnthropicIcon className="size-3 text-xs flex-shrink-0" />
      ) : null}
      <div className="truncate w-full">{model}</div>
    </Badge>
  );
}
