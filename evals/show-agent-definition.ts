import { weatherAgent } from '../examples/weather-project/agents/weather-agent';

async function showAgentDefinition() {
  console.log('Getting agent full definition...\n');
  
  const definition = await weatherAgent.toFullAgentDefinition();
  
  console.log('=== FULL AGENT DEFINITION ===\n');
  console.log(JSON.stringify(definition, null, 2));
  
  console.log('\n\n=== SUMMARY ===');
  console.log('Agent ID:', definition.id);
  console.log('Agent Name:', definition.name);
  console.log('Sub-agents:', Object.keys(definition.subAgents || {}).join(', '));
  console.log('Total sub-agents:', Object.keys(definition.subAgents || {}).length);
}

showAgentDefinition().catch(console.error);

