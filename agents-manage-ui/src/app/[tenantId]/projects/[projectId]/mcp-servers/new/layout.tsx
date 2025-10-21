import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

export default async function NewMCPServerLayout({
  children,
  params,
}: LayoutProps<'/[tenantId]/projects/[projectId]/mcp-servers/new'>) {
  const { tenantId, projectId } = await params;
  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'MCP servers',
          href: `/${tenantId}/projects/${projectId}/mcp-servers`,
        },
        { label: 'New MCP server' },
      ]}
    >
      <MainContent>{children}</MainContent>
    </BodyTemplate>
  );
}
