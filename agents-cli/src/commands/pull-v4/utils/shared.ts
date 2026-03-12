import path from 'node:path';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function expectSnapshots(definitionV4: string): Promise<void> {
  const { currentTestName, snapshotState } = expect.getState();

  const snapshotDir = path.basename(snapshotState.testFilePath).replace('-generator.test.ts', '');
  await expect(definitionV4).toMatchFileSnapshot(
    `__snapshots__/${snapshotDir}/${currentTestName}-v4.txt`
  );
}

export function hasReferences<T>(references?: T[]): references is T[] {
  return Array.isArray(references) && references.length > 0;
}
