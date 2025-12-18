import { BodyTemplate } from '@/components/layout/body-template';

export default function Layout({ children }: LayoutProps<'/[tenantId]/projects'>) {
  return <BodyTemplate breadcrumbs={[]}>{children}</BodyTemplate>;
}
