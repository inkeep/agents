import { SiteContent } from '@/components/layout/site-content';
import { SiteHeader } from '@/components/layout/site-header';

type BodyTemplateProps = {
  children: React.ReactNode;
  breadcrumbs: { label: string; href?: string }[];
};

export function BodyTemplate({ children, breadcrumbs }: BodyTemplateProps) {
  return (
    <div className="h-[calc(100vh-16px)] flex flex-col overflow-hidden">
      <SiteHeader breadcrumbs={breadcrumbs} />
      <SiteContent>{children}</SiteContent>
    </div>
  );
}
