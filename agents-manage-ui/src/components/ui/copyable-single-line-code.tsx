import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function CopyableSingleLineCode({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2 relative bg-muted/50 dark:bg-muted/30 rounded-md border">
      <ScrollArea dir="ltr" className="w-full">
        <pre className="text-sm text-foreground/90 px-3 pr-8 py-2 font-mono">{code}</pre>
        <CopyButton className="absolute right-1 top-1/2 -translate-y-1/2" textToCopy={code} />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
