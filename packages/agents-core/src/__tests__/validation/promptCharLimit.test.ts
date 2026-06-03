import { describe, expect, it } from 'vitest';
import { VALIDATION_AGENT_PROMPT_MAX_CHARS } from '../../constants/schema-validation';
import {
  AgentApiInsertSchema,
  AgentApiUpdateSchema,
  AgentWithinContextOfProjectSchemaBase,
  FullAgentAgentInsertSchema,
  SubAgentApiInsertSchema,
  SubAgentApiUpdateSchema,
} from '../../validation/schemas';

/**
 * Pins the lifted + unified system-prompt character cap.
 * Both the agent-level prompt and the sub-agent prompt share
 * VALIDATION_AGENT_PROMPT_MAX_CHARS, enforced on every create/update write path.
 *
 * These tests isolate prompt-length validation: they only inspect issues whose
 * path ends in `prompt` (code `too_big`), so unrelated required-field errors on
 * the larger schemas don't make the test brittle.
 */

const CAP = VALIDATION_AGENT_PROMPT_MAX_CHARS;

/** Returns the prompt-length (`too_big`) issue if present, else undefined. */
function promptTooBig(result: { success: boolean; error?: { issues: Array<any> } }) {
  if (result.success) return undefined;
  return result.error?.issues.find(
    (i) => i.code === 'too_big' && i.path[i.path.length - 1] === 'prompt'
  );
}

const atCap = 'a'.repeat(CAP);
const overCap = 'a'.repeat(CAP + 1);

describe('system-prompt character cap', () => {
  it('is the lifted, generous value (200,000)', () => {
    expect(CAP).toBe(200_000);
  });

  describe('agent prompt (standalone REST path)', () => {
    it('accepts a prompt exactly at the cap', () => {
      expect(
        promptTooBig(AgentApiInsertSchema.safeParse({ prompt: atCap }) as any)
      ).toBeUndefined();
    });

    it('rejects a prompt one over the cap (create)', () => {
      const issue = promptTooBig(AgentApiInsertSchema.safeParse({ prompt: overCap }) as any);
      expect(issue).toBeDefined();
      expect(issue?.message).toContain(String(CAP));
    });

    it('rejects a prompt one over the cap (update/PATCH)', () => {
      expect(
        promptTooBig(AgentApiUpdateSchema.safeParse({ prompt: overCap }) as any)
      ).toBeDefined();
    });
  });

  describe('agent prompt (full-graph path)', () => {
    it('accepts a prompt exactly at the cap', () => {
      expect(
        promptTooBig(AgentWithinContextOfProjectSchemaBase.safeParse({ prompt: atCap }) as any)
      ).toBeUndefined();
    });

    it('rejects a prompt one over the cap', () => {
      expect(
        promptTooBig(AgentWithinContextOfProjectSchemaBase.safeParse({ prompt: overCap }) as any)
      ).toBeDefined();
    });
  });

  describe('sub-agent prompt (standalone REST path)', () => {
    it('accepts a prompt exactly at the cap', () => {
      expect(
        promptTooBig(SubAgentApiInsertSchema.safeParse({ prompt: atCap }) as any)
      ).toBeUndefined();
    });

    it('rejects a prompt one over the cap (create)', () => {
      expect(
        promptTooBig(SubAgentApiInsertSchema.safeParse({ prompt: overCap }) as any)
      ).toBeDefined();
    });

    it('rejects a prompt one over the cap (update/PATCH)', () => {
      expect(
        promptTooBig(SubAgentApiUpdateSchema.safeParse({ prompt: overCap }) as any)
      ).toBeDefined();
    });
  });

  describe('sub-agent prompt (full-graph override path)', () => {
    it('accepts a prompt exactly at the cap', () => {
      expect(
        promptTooBig(FullAgentAgentInsertSchema.safeParse({ prompt: atCap }) as any)
      ).toBeUndefined();
    });

    it('rejects a prompt one over the cap', () => {
      expect(
        promptTooBig(FullAgentAgentInsertSchema.safeParse({ prompt: overCap }) as any)
      ).toBeDefined();
    });
  });

  // Regression: capping the sub-agent prompt must not drop the column's nullability.
  // `subAgents.prompt` is a nullable text column, so `prompt: null` (clearing the prompt)
  // is a supported REST pattern and must keep validating.
  describe('sub-agent prompt nullability (clear-via-null preserved)', () => {
    const promptIssue = (result: any) =>
      result.success
        ? undefined
        : result.error?.issues.find((i: any) => i.path[i.path.length - 1] === 'prompt');

    it('SubAgentApiInsertSchema accepts prompt: null', () => {
      expect(promptIssue(SubAgentApiInsertSchema.safeParse({ prompt: null }))).toBeUndefined();
    });

    it('SubAgentApiUpdateSchema accepts prompt: null', () => {
      expect(promptIssue(SubAgentApiUpdateSchema.safeParse({ prompt: null }))).toBeUndefined();
    });

    it('FullAgentAgentInsertSchema accepts prompt: null', () => {
      expect(promptIssue(FullAgentAgentInsertSchema.safeParse({ prompt: null }))).toBeUndefined();
    });
  });
});
