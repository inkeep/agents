import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function CopyableMultiLineCode({ code }: { code: string }) {
  return (
    <div className="relative bg-muted/50 dark:bg-muted/30 rounded-md border overflow-hidden">
      <ScrollArea className="h-20 w-full">
        <div className="px-3 py-2 pr-8">
          <pre className="text-sm text-foreground/90 font-mono whitespace-pre-wrap break-words leading-5">
            {code}
          </pre>
        </div>
      </ScrollArea>
      <CopyButton className="absolute right-1 top-1 z-10" textToCopy={code} />
    </div>
  );
}
