import { Plus } from 'lucide-react';
import Link from 'next/link';
import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '../ui/item-card';

interface NewDatasetItemProps {
  tenantId: string;
}

export function NewDatasetItem({ tenantId }: NewDatasetItemProps) {
  const href = `/${tenantId}/evaluations/datasets/new`;

  return (
    <ItemCardRoot className="border-dashed hover:border-solid hover:border-primary/50 transition-colors">
      <ItemCardLink href={href}>
        <ItemCardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <ItemCardTitle className="text-md">New Dataset</ItemCardTitle>
          </div>
        </ItemCardHeader>
      </ItemCardLink>
      <ItemCardLink href={href} className="group flex h-full">
        <ItemCardContent>
          <ItemCardDescription hasContent={true} className="line-clamp-2">
            Create a new dataset with test cases
          </ItemCardDescription>
        </ItemCardContent>
      </ItemCardLink>
    </ItemCardRoot>
  );
}
