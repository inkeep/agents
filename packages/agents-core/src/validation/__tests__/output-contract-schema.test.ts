import { describe, expect, it } from 'vitest';
import { OutputContractSchema } from '../schemas';

describe('OutputContractSchema', () => {
  it('accepts requireTransfer on its own', () => {
    expect(OutputContractSchema.safeParse({ requireTransfer: true }).success).toBe(true);
  });

  it('accepts requireComponent and requireArtifact together', () => {
    expect(
      OutputContractSchema.safeParse({
        requireComponent: ['A'],
        requireArtifact: ['B'],
      }).success
    ).toBe(true);
  });

  it('rejects requireTransfer combined with requireComponent (FR14)', () => {
    expect(
      OutputContractSchema.safeParse({
        requireTransfer: true,
        requireComponent: ['A'],
      }).success
    ).toBe(false);
  });

  it('rejects requireTransfer combined with requireArtifact (FR14)', () => {
    expect(
      OutputContractSchema.safeParse({
        requireTransfer: true,
        requireArtifact: ['B'],
      }).success
    ).toBe(false);
  });
});
