import { act } from '@testing-library/react';
import { type NodeProps, ReactFlowProvider } from '@xyflow/react';
import { NodeType } from '@/components/agent/configuration/node-types';
import { ExternalAgentNode } from '@/components/agent/nodes/external-agent-node';
import { FunctionToolNode } from '@/components/agent/nodes/function-tool-node';
import { MCPNode } from '@/components/agent/nodes/mcp-node';
import { PlaceholderNode } from '@/components/agent/nodes/placeholder-node';
import { SubAgentNode } from '@/components/agent/nodes/sub-agent-node';
import { TeamAgentNode } from '@/components/agent/nodes/team-agent-node';
import { FullAgentFormProvider } from '@/contexts/full-agent-form';
import { createTestQueryClient, renderWithClient } from '@/lib/query/__tests__/test-utils';
import { mcpToolQueryKeys } from '@/lib/query/keys/mcp-tools';
import { projectQueryKeys } from '@/lib/query/keys/projects';
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
    <FullAgentFormProvider
      defaultValues={{
        defaultSubAgentNodeId: 'SubAgent',
        subAgents: {
          // @ts-expect-error
          SubAgent: DATA,
        },
        externalAgents: {
          // @ts-expect-error
          ExternalAgent: DATA,
        },
        teamAgents: {
          // @ts-expect-error
          TeamAgent: DATA,
        },
        tools: {
          [TOOL_ID]: {
            ...DATA,
            config: {
              type: 'mcp',
              // @ts-expect-error
              mcp: {},
            },
          },
        },
        functionTools: {
          // @ts-expect-error
          [TOOL_ID]: DATA,
        },
        // @ts-expect-error
        models: {
          base: {},
        },
      }}
    >
      <ReactFlowProvider>
        <ExternalAgentNode {...baseProps} id="ExternalAgent" />
        {divider}
        <FunctionToolNode {...baseProps} data={{ toolId: TOOL_ID }} />
        {divider}
        <MCPNode {...baseProps} data={{ toolId: TOOL_ID }} />
        {divider}
        <PlaceholderNode {...baseProps} data={{ name: DATA.name, type: NodeType.MCPPlaceholder }} />
        {divider}
        <SubAgentNode {...baseProps} id="SubAgent" />
        {divider}
        <TeamAgentNode {...baseProps} id="TeamAgent" />
      </ReactFlowProvider>
    </FullAgentFormProvider>
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
