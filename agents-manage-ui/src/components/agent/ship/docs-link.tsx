import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface DocsLinkProps {
  href: string; // relative path to the docs
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
