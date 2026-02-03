import { act, render } from '@testing-library/react';
import { SubAgentNode } from '@/components/agent/nodes/sub-agent-node';
import { ReactFlowProvider } from '@xyflow/react';
import { ExternalAgentNode } from '@/components/agent/nodes/external-agent-node';
import { FunctionToolNode } from '@/components/agent/nodes/function-tool-node';
import { MCPNode } from '@/components/agent/nodes/mcp-node';
import { PlaceholderNode } from '@/components/agent/nodes/placeholder-node';
import { TeamAgentNode } from '@/components/agent/nodes/team-agent-node';
import '../../../form/__tests__/styles.css';

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
    name: 'name'.repeat(10),
    description: 'description'.repeat(10),
  };

  return (
    <ReactFlowProvider>
      {divider}
      <ExternalAgentNode id="foo" data={data} />
      {divider}
      <FunctionToolNode id="foo" data={data} />
      {divider}
      <MCPNode id="foo" data={{ ...data, imageUrl: 'https://pilot.inkeep.com/icon.svg' }} />
      {divider}
      <PlaceholderNode id="foo" data={{ ...data, type: 'agent' }} />
      {divider}
      <SubAgentNode
        selected
        id="foo"
        data={{
          ...data,
          isDefault: true,
        }}
      />
      {divider}
      <TeamAgentNode id="foo" data={data} />
      {divider}
    </ReactFlowProvider>
  );
}

describe.only('Nodes', () => {
  test('should handle of long names with character limit', async () => {
    const { container } = render(<Nodes />);
    await act(async () => {
      await expect(container).toMatchScreenshot();
    });
  }, 20_000);
});
