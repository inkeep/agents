import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '../ui/card';

interface NewDatasetItemProps {
  tenantId: string;
  projectId: string;
}

export function NewDatasetItem({ tenantId, projectId }: NewDatasetItemProps) {
  return (
    <Link href={`/${tenantId}/projects/${projectId}/datasets/new`} className="group">
      <Card className="h-full bg-transparent border-1 shadow-none hover:bg-background hover:ring-2 hover:ring-accent/50 dark:hover:ring-accent/30 transition-all duration-300 cursor-pointer group border-dashed">
        <CardContent className="flex flex-row items-center justify-center text-center gap-2 flex-1">
          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          <h3 className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            Create test suite
          </h3>
        </CardContent>
      </Card>
    </Link>
  );
}
