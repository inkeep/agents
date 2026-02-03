import { act, render } from '@testing-library/react';
import {
  BaseNode,
  BaseNodeHeader,
  BaseNodeContent,
  BaseNodeHeaderTitle,
  BaseNodeFooter,
} from '../base-node';
import '../../../form/__tests__/styles.css';
import { SubAgentNode } from '@/components/agent/nodes/sub-agent-node';
import { ReactFlowProvider } from '@xyflow/react';
import { ExternalAgentNode } from '@/components/agent/nodes/external-agent-node';
import { FunctionToolNode } from '@/components/agent/nodes/function-tool-node';
import { MCPNode } from '@/components/agent/nodes/mcp-node';
import { PlaceholderNode } from '@/components/agent/nodes/placeholder-node';
import { TeamAgentNode } from '@/components/agent/nodes/team-agent-node';

function Nodes() {
  const divider = <hr style={{ borderColor: 'green' }} />;
  return (
    <ReactFlowProvider>
      {divider}
      <ExternalAgentNode />
      {divider}
      <FunctionToolNode />
      {divider}
      <MCPNode />
      {divider}
      <PlaceholderNode />
      {divider}
      <SubAgentNode
        selected
        data={{
          id: 'foo',
          name: 'SubAgentNode'.repeat(10),
          isDefault: true,
          description: 'description '.repeat(10),
        }}
      />
      {divider}
      <TeamAgentNode />
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
