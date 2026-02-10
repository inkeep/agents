import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ProjectStats {
  projectId: string;
  totalConversations: number;
  totalAICalls: number;
  totalMCPCalls: number;
}

export function ToolCallsByProject({
  projectStats,
  projectNameMap,
  projectStatsLoading,
}: {
  projectStats: ProjectStats[];
  projectNameMap: Map<string, string>;
  projectStatsLoading: boolean;
}) {
  return (
    <Table
      className="lg:table-fixed"
      containerClassName="max-h-80 overflow-y-auto overflow-x-auto scrollbar-thin 
        scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent dark:scrollbar-thumb-muted-foreground/50"
    >
      <TableHeader className="sticky top-0 z-10 bg-sidebar dark:bg-card [&_tr]:border-b shadow-[0_1px_0_0_hsl(var(--border))]">
        <TableRow noHover>
          <TableHead className="md:w-full min-w-48 bg-sidebar dark:bg-card">Project</TableHead>
          <TableHead className="text-right lg:w-36 bg-sidebar dark:bg-card">MCP Calls</TableHead>
          <TableHead className="text-right lg:w-40 bg-sidebar dark:bg-card">
            Conversations
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr]:border-border/50 px-0">
        {projectStatsLoading ? (
          [1, 2, 3].map((row) => (
            <TableRow key={row} noHover>
              <TableCell className="py-4">
                <Skeleton className="h-6 w-32" />
              </TableCell>
              {[1, 2].map((col) => (
                <TableCell key={col} className="text-right py-4">
                  <Skeleton className="h-6 w-12 ml-auto" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : projectStats.length === 0 ? (
          <TableRow noHover>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              No MCP calls detected in the selected time range.
            </TableCell>
          </TableRow>
        ) : (
          [...projectStats]
            .sort((a, b) => b.totalMCPCalls - a.totalMCPCalls)
            .map((stat) => (
              <TableRow key={stat.projectId} noHover>
                <TableCell className="font-medium truncate block w-0 min-w-full">
                  {projectNameMap.get(stat.projectId) || stat.projectId}
                </TableCell>
                <TableCell className="text-right font-mono text-primary text-base font-bold">
                  {stat.totalMCPCalls.toLocaleString()}
                </TableCell>

                <TableCell className="text-right font-mono text-muted-foreground text-base">
                  {stat.totalConversations.toLocaleString()}
                </TableCell>
              </TableRow>
            ))
        )}
      </TableBody>
    </Table>
  );
}
