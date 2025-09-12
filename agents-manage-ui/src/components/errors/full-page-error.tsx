'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

interface FullPageErrorProps {
  title?: string;
  description?: string;
  link?: string;
  linkText?: string;
}

export default function FullPageError({ title, description, link, linkText }: FullPageErrorProps) {
  return (
    <BodyTemplate breadcrumbs={[{ label: title ?? 'Error' }]}>
      <MainContent className="flex-1">
        <div className="flex flex-col items-center justify-center h-full gap-4">
          {title && <p className="text-lg text-foreground font-semibold">{title}</p>}
          <div className="text-muted-foreground gap-2 flex flex-col items-center justify-center">
            {description && <p>{description}</p>}
            {link && linkText && (
              <Link
                href={link}
                className="flex items-center gap-2 underline text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                {linkText}
              </Link>
            )}
          </div>
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
