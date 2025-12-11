import { Inngest } from 'inngest';
import { env } from '../env';

export const inngest = new Inngest({
  id: 'inkeep-agents-run',
  name: 'Inkeep Agents Run',
  eventKey: env.INNGEST_EVENT_KEY,
  isDev: env.INNGEST_DEV,
});

