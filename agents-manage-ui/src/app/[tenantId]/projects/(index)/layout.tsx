import { BodyTemplate } from '@/components/layout/body-template';

export default function Layout({ children }: LayoutProps<'/[tenantId]/projects'>) {
  return <BodyTemplate breadcrumbs={[{ label: 'Projects' }]}>{children}</BodyTemplate>;
}
