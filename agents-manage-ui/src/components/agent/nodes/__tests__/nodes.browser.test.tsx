import { act } from '@testing-library/react';
import { type NodeProps, ReactFlowProvider } from '@xyflow/react';
import { NodeType } from '@/components/agent/configuration/node-types';
import { ExternalAgentNode } from '@/components/agent/nodes/external-agent-node';
import { FunctionToolNode } from '@/components/agent/nodes/function-tool-node';
import { MCPNode } from '@/components/agent/nodes/mcp-node';
import { PlaceholderNode } from '@/components/agent/nodes/placeholder-node';
import { SubAgentNode } from '@/components/agent/nodes/sub-agent-node';
import { TeamAgentNode } from '@/components/agent/nodes/team-agent-node';
import { createTestQueryClient, renderWithClient } from '@/lib/query/__tests__/test-utils';
import { projectQueryKeys } from '@/lib/query/keys/projects';
import { mcpToolQueryKeys } from '@/lib/query/keys/mcp-tools';
import '@/lib/utils/test-utils/styles.css';

const TENANT_ID = 'tenant-1';
const PROJECT_ID = 'project-1';
const TOOL_ID = 'tool-1';
const DATA = {
  name: 'name '.repeat(10),
  description: 'description '.repeat(10),
};

vi.mock('next/navigation', () => {
  return {
    useParams() {
      return { tenantId: TENANT_ID, projectId: PROJECT_ID };
    },
  };
});
vi.mock('@/contexts/runtime-config', () => {
  return {
    useRuntimeConfig() {
      return {};
    },
  };
});
vi.mock('@/lib/query/mcp-tools', async () => {
  const actual = await vi.importActual('@/lib/query/mcp-tools');
  return {
    ...actual,
    useMcpToolsQuery() {
      return { data: [] };
    },
  };
});
vi.mock('@/lib/query/data-components', () => {
  return {
    useDataComponentsQuery() {
      return { data: [] };
    },
  };
});
vi.mock('@/lib/query/artifact-components', () => {
  return {
    useArtifactComponentsQuery() {
      return { data: [] };
    },
  };
});

function Nodes() {
  const divider = <hr style={{ borderColor: 'green' }} />;

  const baseProps: NodeProps = {
    type: 'foo',
    id: 'foo',
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    selected: true,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    data: {},
  };

  return (
    <ReactFlowProvider>
      <ExternalAgentNode {...baseProps} data={{ ...DATA, id: 'foo', baseUrl: 'foo' }} />
      {divider}
      <FunctionToolNode {...baseProps} data={{ ...DATA, functionToolId: 'foo' }} />
      {divider}
      <MCPNode {...baseProps} data={{ ...DATA, toolId: TOOL_ID }} />
      {divider}
      <PlaceholderNode {...baseProps} data={{ ...DATA, type: NodeType.MCPPlaceholder }} />
      {divider}
      <SubAgentNode {...baseProps} data={{ ...DATA, id: 'foo', isDefault: true, skills: [] }} />
      {divider}
      <TeamAgentNode {...baseProps} data={{ ...DATA, id: 'foo' }} />
    </ReactFlowProvider>
  );
}

describe('Nodes', () => {
  test('should handle long names with character limit', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(projectQueryKeys.detail(TENANT_ID, PROJECT_ID), {
      models: {
        base: { model: `openai/${DATA.name}` },
      },
    });
    queryClient.setQueryData(mcpToolQueryKeys.status(TENANT_ID, PROJECT_ID, TOOL_ID), {
      name: DATA.name,
    });

    const { container } = renderWithClient(<Nodes />, queryClient);
    await act(async () => {
      await expect(container).toMatchScreenshot();
    });
  }, 30_000);
});
