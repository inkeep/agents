import { act, render } from '@testing-library/react';
import {
  BaseNode,
  BaseNodeHeader,
  BaseNodeContent,
  BaseNodeHeaderTitle,
  BaseNodeFooter,
} from '../base-node';
import '../../../form/__tests__/styles.css';

function Nodes() {
  const divider = <hr style={{ borderColor: 'green' }} />;
  return (
    <>
      <BaseNode>
        <BaseNodeHeader style={{ background: 'blue' }}>
          {'BaseNodeHeader'.repeat(10)}
          <BaseNodeHeaderTitle style={{ background: 'green' }}>
            {'BaseNodeHeaderTitle'.repeat(10)}
          </BaseNodeHeaderTitle>
        </BaseNodeHeader>
        <BaseNodeContent style={{ background: 'red' }}>
          {'BaseNodeContent'.repeat(10)}
        </BaseNodeContent>
        <BaseNodeFooter style={{ background: 'yellow' }}>
          {'BaseNodeFooter'.repeat(10)}
        </BaseNodeFooter>
      </BaseNode>
      {divider}
    </>
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
