import { describe, expect, it } from 'vitest';
import { SubAgent } from '../subAgent';

describe('SubAgent output contract validation', () => {
  it('rejects init when requireComponent names an undeclared dataComponent (FR6)', async () => {
    const agent = new SubAgent({
      id: 'query-agent',
      name: 'Query Agent',
      description: 'test',
      prompt: 'test',
      outputContract: { requireComponent: ['Missing'] },
    });

    await expect(agent.init()).rejects.toThrow(/outputContract\.requireComponent='Missing'/);
  });

  it('rejects init when requireArtifact names an undeclared artifactComponent (FR11)', async () => {
    const agent = new SubAgent({
      id: 'report-agent',
      name: 'Report Agent',
      description: 'test',
      prompt: 'test',
      outputContract: { requireArtifact: ['Missing'] },
    });

    await expect(agent.init()).rejects.toThrow(/outputContract\.requireArtifact='Missing'/);
  });

  it('rejects init when requireTransfer is true but no canTransferTo() targets declared (FR7)', async () => {
    const agent = new SubAgent({
      id: 'select-agent',
      name: 'Select Agent',
      description: 'test',
      prompt: 'test',
      outputContract: { requireTransfer: true },
    });

    await expect(agent.init()).rejects.toThrow(/outputContract\.requireTransfer is true/);
  });

  it('rejects init when requireTransfer is combined with requireComponent (FR14)', async () => {
    const agent = new SubAgent({
      id: 'mixed-agent',
      name: 'Mixed Agent',
      description: 'test',
      prompt: 'test',
      outputContract: { requireTransfer: true, requireComponent: ['Anything'] },
    });

    await expect(agent.init()).rejects.toThrow(/mutually exclusive/);
  });

  it('rejects init when requireTransfer is combined with requireArtifact (FR14)', async () => {
    const agent = new SubAgent({
      id: 'mixed-agent-2',
      name: 'Mixed Agent',
      description: 'test',
      prompt: 'test',
      outputContract: { requireTransfer: true, requireArtifact: ['Anything'] },
    });

    await expect(agent.init()).rejects.toThrow(/mutually exclusive/);
  });
});
