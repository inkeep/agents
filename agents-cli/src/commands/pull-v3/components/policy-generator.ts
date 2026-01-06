import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';

type PolicyMap = Record<
  string,
  {
    name: string;
    description?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
  }
>;

function formatMetadata(metadata: Record<string, unknown>): string {
  const yaml = stringify(metadata);
  const indented = yaml
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => `  ${line}`)
    .join('\n');
  return `metadata:\n${indented}`;
}

export async function generatePolicies(policies: PolicyMap, policiesDir: string): Promise<void> {
  await mkdir(policiesDir, { recursive: true });

  for (const [policyId, policy] of Object.entries(policies)) {
    const parts: string[] = ['---', `name: ${JSON.stringify(policy.name)}`];
    parts.push(`description: ${JSON.stringify(policy.description ?? '')}`);

    if (policy.metadata && Object.keys(policy.metadata).length > 0) {
      parts.push(formatMetadata(policy.metadata));
    }

    parts.push('---', '', policy.content || '');

    const filePath = join(policiesDir, `${policyId}.md`);
    await writeFile(filePath, parts.join('\n'), 'utf8');
  }
}
