'use client';
import type { StructuredData } from 'fumadocs-core/mdx-plugins';
import { ChevronsUpDown, Copy } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type ComponentProps, useState } from 'react';
import { ChatGptIcon, ClaudeIcon } from '@/components/brand-icons';
import { useCopyButton } from '@/components/hooks/use-copy-button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function PageControls({
  title,
  description,
  data,
}: {
  data: StructuredData;
  title: string;
  description: string;
} & ComponentProps<'button'>) {
  const [open, setOpen] = useState(false);

  const [copied, onClickCopy] = useCopyButton(() => {
    const { contents, headings } = data;
    const markdown =
      '# ' +
      title +
      '\n' +
      description +
      '\n' +
      contents.reduce((acc, { heading, content }) => {
        return (
          acc +
          (heading ? '## ' + headings.find((h) => h.id === heading)?.content + '\n' : '') +
          content +
          '\n'
        );
      }, '');
    navigator.clipboard.writeText(markdown);
    setOpen(false);
  });

  const pathname = usePathname();
  const currentPage = 'https://docs.inkeep.com' + pathname + '.md';
  const askPrompt = "I'd like to discuss the content from " + currentPage;

  const openInChatGPT = () => {
    const uri = `https://chat.openai.com/?model=gpt-4&q=${encodeURIComponent(askPrompt)}`;
    setOpen(false);
    window.open(uri, '_blank');
  };

  const openInClaude = () => {
    const uri = `https://claude.ai/new?q=${encodeURIComponent(askPrompt)}`;
    setOpen(false);
    window.open(uri, '_blank');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor
        className={cn(
          'flex items-center rounded-lg',
          'hover:text-fd-accent-foreground',
          'border rounded-lg divide-x'
        )}
      >
        <Item
          title={copied ? 'Copied' : 'Copy page'}
          data-copied={copied ? '' : undefined}
          icon={<Copy className="size-4" />}
          className="py-0 [&_i]:border-none gap-0 pl-0 pr-1.5 data-[copied]:text-fd-muted-foreground"
          onClick={onClickCopy}
        />
        <PopoverTrigger className="px-1">
          <ChevronsUpDown className="size-4 text-fd-muted-foreground hover:text-fd-accent-foreground" />
        </PopoverTrigger>
      </PopoverAnchor>

      <PopoverContent className="w-(--radix-popover-trigger-width) overflow-hidden p-0" align="end">
        <Item
          title="Copy page"
          description="Copy page as markdown"
          icon={<Copy className="size-4" />}
          onClick={onClickCopy}
        />
        <Item
          title="Open in Claude"
          description="Open page in Claude"
          icon={<ClaudeIcon />}
          onClick={openInClaude}
        />
        <Item
          title="Open in ChatGPT"
          description="Open page in ChatGPT"
          icon={<ChatGptIcon />}
          onClick={openInChatGPT}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ItemProps extends ComponentProps<'span'> {
  title: string;
  description?: string;
  icon: React.ReactNode;
}

function Item({ title, description, icon, className, ...props }: ItemProps) {
  return (
    <span
      className={cn(
        'flex w-full flex-row items-center gap-2 px-2 py-1.5',
        'hover:bg-fd-accent/50 cursor-pointer',
        className
      )}
      {...props}
    >
      <i className="rounded-lg p-1.5 m-px border text-fd-muted-foreground">{icon}</i>
      <div className="flex-1 text-start">
        <p className="text-[15px] font-medium md:text-sm whitespace-nowrap">{title}</p>
        {description ? (
          <p className="text-sm text-fd-muted-foreground md:text-xs">{description}</p>
        ) : null}
      </div>
    </span>
  );
}
