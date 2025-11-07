import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const Header = {
  Container: ({ children }: { children: React.ReactNode }) => {
    return <div className="flex justify-between items-center mb-6">{children}</div>;
  },
  Title: ({ title }: { title: string }) => {
    return <h3 className="text-md font-medium">{title}</h3>;
  },
  Description: ({ description }: { description: string }) => {
    return <p className="text-sm text-muted-foreground">{description}</p>;
  },
};

interface DocsLinkProps {
  href: string;
}

export function DocsLink({ href }: DocsLinkProps) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} target="_blank" rel="noreferrer noopener">
        <BookOpen className="size-4" />
        View Docs
      </Link>
    </Button>
  );
}
