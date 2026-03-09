import { act, render } from '@testing-library/react';
import { type NodeProps, ReactFlowProvider } from '@xyflow/react';
import { NodeType } from '@/components/agent/configuration/node-types';
import { ExternalAgentNode } from '@/components/agent/nodes/external-agent-node';
import { FunctionToolNode } from '@/components/agent/nodes/function-tool-node';
import { MCPNode } from '@/components/agent/nodes/mcp-node';
import { PlaceholderNode } from '@/components/agent/nodes/placeholder-node';
import { SubAgentNode } from '@/components/agent/nodes/sub-agent-node';
import { TeamAgentNode } from '@/components/agent/nodes/team-agent-node';
import { FullAgentFormProvider } from '@/contexts/full-agent-form';
import '@/lib/utils/test-utils/styles.css';

vi.mock('next/navigation', () => {
  return {
    useParams() {
      return {};
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
vi.mock('@/lib/query/mcp-tools', () => {
  return {
    useMcpToolStatusQuery() {
      return {};
    },
  };
});

function Nodes() {
  const divider = <hr style={{ borderColor: 'green' }} />;
  const data = {
    name: 'name '.repeat(10),
    description: 'description '.repeat(10),
  };

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
        defaultSubAgentId: 'SubAgent',
        subAgents: {
          // @ts-expect-error
          SubAgent: data,
        },
        externalAgents: {
          // @ts-expect-error
          ExternalAgent: data,
        },
        teamAgents: {
          // @ts-expect-error
          TeamAgent: data,
        },
        tools: {
          Tool: {
            ...data,
            config: {
              type: 'mcp',
              // @ts-expect-error
              mcp: {},
            },
          },
        },
        functionTools: {
          // @ts-expect-error
          Tool: data,
        },
      }}
    >
      <ReactFlowProvider>
        <ExternalAgentNode {...baseProps} data={{ ...data, id: 'ExternalAgent', baseUrl: 'foo' }} />
        {divider}
        <FunctionToolNode {...baseProps} data={{ ...data, toolId: 'Tool' }} />
        {divider}
        <MCPNode
          {...baseProps}
          data={{ ...data, imageUrl: 'https://pilot.inkeep.com/icon.svg', toolId: 'Tool' }}
        />
        {divider}
        <PlaceholderNode {...baseProps} data={{ ...data, type: NodeType.MCPPlaceholder }} />
        {divider}
        <SubAgentNode {...baseProps} id="SubAgent" data={{ ...data, skills: [] }} />
        {divider}
        <TeamAgentNode {...baseProps} data={{ ...data, id: 'TeamAgent' }} />
      </ReactFlowProvider>
    </FullAgentFormProvider>
  );
}

describe('Nodes', () => {
  test('should handle long names with character limit', async () => {
    const { container } = render(<Nodes />);
    await act(async () => {
      await expect(container).toMatchScreenshot();
    });
  }, 30_000);
});
