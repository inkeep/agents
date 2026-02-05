import { act, render } from '@testing-library/react';
import { type NodeProps, ReactFlowProvider } from '@xyflow/react';
import { NodeType } from '@/components/agent/configuration/node-types';
import { ExternalAgentNode } from '@/components/agent/nodes/external-agent-node';
import { FunctionToolNode } from '@/components/agent/nodes/function-tool-node';
import { MCPNode } from '@/components/agent/nodes/mcp-node';
import { PlaceholderNode } from '@/components/agent/nodes/placeholder-node';
import { SubAgentNode } from '@/components/agent/nodes/sub-agent-node';
import { TeamAgentNode } from '@/components/agent/nodes/team-agent-node';
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
    <ReactFlowProvider>
      <ExternalAgentNode {...baseProps} data={{ ...data, id: 'foo', baseUrl: 'foo' }} />
      {divider}
      <FunctionToolNode {...baseProps} data={{ ...data, functionToolId: 'foo' }} />
      {divider}
      <MCPNode
        {...baseProps}
        data={{ ...data, imageUrl: 'https://pilot.inkeep.com/icon.svg', toolId: 'foo' }}
      />
      {divider}
      <PlaceholderNode {...baseProps} data={{ ...data, type: NodeType.MCPPlaceholder }} />
      {divider}
      <SubAgentNode {...baseProps} data={{ ...data, id: 'foo', isDefault: true }} />
      {divider}
      <TeamAgentNode {...baseProps} data={{ ...data, id: 'foo' }} />
    </ReactFlowProvider>
  );
}

describe('Nodes', () => {
  test('should handle long names with character limit', async () => {
    const { container } = render(<Nodes />);
    await act(async () => {
      await expect(container).toMatchScreenshot();
    });
  }, 20_000);
});
