import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function removeSymlinks(target: string): Promise<number> {
  const stats = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stats) return 0;
  if (stats.isSymbolicLink()) {
    await fs.unlink(target);
    return 1;
  }
  if (!stats.isDirectory()) return 0;
  let removed = 0;
  for (const name of await fs.readdir(target)) {
    removed += await removeSymlinks(path.join(target, name));
  }
  return removed;
}

const { files } = JSON.parse(await fs.readFile('package.json', 'utf8')) as { files: string[] };
let removed = 0;
for (const entry of files.filter((file) => file.startsWith('.next/'))) {
  removed += await removeSymlinks(entry);
}
console.log(`Removed ${removed} symlinks from the published .next build output`);
