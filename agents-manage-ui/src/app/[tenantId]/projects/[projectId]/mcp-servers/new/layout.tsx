import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';

export default async function NewMCPServerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
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
