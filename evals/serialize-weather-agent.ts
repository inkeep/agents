import { weatherAgent } from '../examples/weather-project/agents/weather-agent';

async function runEval() {  
  const serialized = await weatherAgent.toFullAgentDefinition();
  console.log('📦 Serialized Agent Definition:\n');
  console.log(JSON.stringify(serialized, null, 2));
}

runEval().catch((error) => {
  console.error('❌ Error running eval:', error);
  process.exit(1);
});

