export function SiteContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent h-full w-full min-h-0 bg-muted/20 dark:bg-background">
      <div className="@container/main min-h-0 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
