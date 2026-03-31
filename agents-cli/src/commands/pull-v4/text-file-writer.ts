import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeTextFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
}
