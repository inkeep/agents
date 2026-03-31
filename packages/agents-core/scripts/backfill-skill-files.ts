import { main } from '../src/dolt/backfill-skill-files';

main().catch((error) => {
  console.error('Skill file backfill failed:', error);
  process.exit(1);
});
