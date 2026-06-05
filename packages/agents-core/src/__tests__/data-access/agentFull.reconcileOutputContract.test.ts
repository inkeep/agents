import { describe, expect, it } from 'vitest';
import { reconcileOutputContract } from '../../data-access/manage/agentFull';

const componentNameById = new Map<string, string>([
  ['comp-id-1', 'SearchResults'],
  ['comp-id-2', 'Citation'],
]);
const artifactNameById = new Map<string, string>([
  ['art-id-1', 'Report'],
  ['art-id-2', 'Invoice'],
]);

describe('reconcileOutputContract', () => {
  it('returns null when no contract is set', () => {
    expect(reconcileOutputContract({}, componentNameById, artifactNameById)).toBeNull();
    expect(
      reconcileOutputContract({ outputContract: null }, componentNameById, artifactNameById)
    ).toBeNull();
  });

  it('retains requireComponent entries that resolve against declared dataComponents', () => {
    const result = reconcileOutputContract(
      {
        dataComponents: ['comp-id-1'],
        outputContract: { requireComponent: ['SearchResults'] },
      },
      componentNameById,
      artifactNameById
    );
    expect(result).toEqual({ requireComponent: ['SearchResults'] });
  });

  it('drops requireComponent entries that name an undeclared component', () => {
    const result = reconcileOutputContract(
      {
        dataComponents: ['comp-id-1'],
        outputContract: { requireComponent: ['SearchResults', 'Ghost'] },
      },
      componentNameById,
      artifactNameById
    );
    expect(result).toEqual({ requireComponent: ['SearchResults'] });
  });

  it('removes the requireComponent key entirely when every entry is undeclared', () => {
    const result = reconcileOutputContract(
      {
        dataComponents: ['comp-id-1'],
        outputContract: { requireComponent: ['Ghost'], allowText: false },
      },
      componentNameById,
      artifactNameById
    );
    expect(result).toEqual({ allowText: false });
    expect(result).not.toHaveProperty('requireComponent');
  });

  it('retains and drops requireArtifact symmetrically with requireComponent', () => {
    const result = reconcileOutputContract(
      {
        artifactComponents: ['art-id-1'],
        outputContract: { requireArtifact: ['Report', 'Missing'] },
      },
      componentNameById,
      artifactNameById
    );
    expect(result).toEqual({ requireArtifact: ['Report'] });

    const allDropped = reconcileOutputContract(
      {
        artifactComponents: ['art-id-1'],
        outputContract: { requireArtifact: ['Missing'], requireTransfer: true },
      },
      componentNameById,
      artifactNameById
    );
    expect(allDropped).toEqual({ requireTransfer: true });
    expect(allDropped).not.toHaveProperty('requireArtifact');
  });

  it('passes through contracts with no require* fields unchanged', () => {
    const result = reconcileOutputContract(
      {
        outputContract: { allowText: false, onViolation: 'warn' },
      },
      componentNameById,
      artifactNameById
    );
    expect(result).toEqual({ allowText: false, onViolation: 'warn' });
  });

  it('does not mutate the input contract', () => {
    const contract = { requireComponent: ['SearchResults', 'Ghost'] };
    reconcileOutputContract(
      {
        dataComponents: ['comp-id-1'],
        outputContract: contract,
      },
      componentNameById,
      artifactNameById
    );
    expect(contract.requireComponent).toEqual(['SearchResults', 'Ghost']);
  });
});
