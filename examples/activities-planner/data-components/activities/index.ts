import { dataComponent } from '@inkeep/agents-sdk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { schema } from './schema';
import { activitiesData } from './ui/mock-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const componentCode = readFileSync(join(__dirname, 'ui', 'component.tsx'), 'utf-8');

export const activities = dataComponent({
  id: 'activities',
  name: `Activities`,
  description: `A list of activities`,
  props: schema,
  render: {
    // component: dataComponent.readFile('./ui/component.tsx'),
    component: componentCode,
    mockData: activitiesData,
  },
});
