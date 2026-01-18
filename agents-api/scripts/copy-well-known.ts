import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const src = resolve(process.cwd(), '.well-known');
const dest = resolve(process.cwd(), 'dist/.well-known');

if (!existsSync(src)) {
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });

