import { main } from '../src/dolt/run-sql-file-on-all-branches';

main().catch((error) => {
  console.error('Backfill runner failed:', error);
  process.exit(1);
});
