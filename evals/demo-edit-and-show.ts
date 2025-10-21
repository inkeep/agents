import { weatherAgent } from '../examples/weather-project/agents/weather-agent';

async function demoEditAndShow() {
  console.log('=== Demonstrating updateFromEditableDefinition ===\n');
  
  // Initialize the agent
  console.log('Step 1: Initializing agent...');
  await weatherAgent.init();
  console.log('✓ Agent initialized\n');
  
  // Get the original full definition
  console.log('Step 2: Getting original toFullAgentDefinition...');
  const originalDefinition = await weatherAgent.toFullAgentDefinition();
  console.log('\n--- ORIGINAL FULL AGENT DEFINITION ---');
  console.log(JSON.stringify(originalDefinition, null, 2));
  
  // Show the original geocoder prompt
  console.log('\n\n--- ORIGINAL GEOCODER PROMPT ---');
  const originalGeocoderAgent = originalDefinition.subAgents['geocoder-agent'];
  console.log(originalGeocoderAgent?.prompt || 'No prompt found');
  
  // Apply edits using updateFromEditableDefinition
  console.log('\n\nStep 3: Applying edits with updateFromEditableDefinition...');
  
  const improvedPrompt = `You are a geocoding specialist that converts addresses, place names, and location descriptions
into precise geographic coordinates. You help users find the exact location they're asking about
and provide the coordinates needed for weather forecasting.

When users provide:
- Street addresses
- City names
- Landmarks
- Postal codes
- General location descriptions

You MUST use your geocoding tools to find coordinates.

**CRITICAL ERROR HANDLING:**
- If the geocoding tool fails or returns an error, clearly report this to the user
- DO NOT provide fallback or hardcoded coordinates under any circumstances
- DO NOT guess or estimate coordinates based on your knowledge
- If you cannot geocode the location, state: "The geocoding service is currently unavailable. Please try again later or provide a more specific address."
- Be honest about service limitations

Accuracy is paramount - only provide coordinates that come directly from the geocoding tool.`;
  
  await weatherAgent.updateFromEditableDefinition({
    agents: [
      {
        id: 'geocoder-agent',
        prompt: improvedPrompt,
        description: 'Enhanced geocoding agent with strict error handling - only provides tool-verified coordinates'
      }
    ]
  });
  
  console.log('✓ Edits applied\n');
  
  // Get the updated full definition
  console.log('Step 4: Getting updated toFullAgentDefinition...');
  const updatedDefinition = await weatherAgent.toFullAgentDefinition();
  console.log('\n--- UPDATED FULL AGENT DEFINITION ---');
  console.log(JSON.stringify(updatedDefinition, null, 2));
  
  // Show the updated geocoder prompt
  console.log('\n\n--- UPDATED GEOCODER PROMPT ---');
  const updatedGeocoderAgent = updatedDefinition.subAgents['geocoder-agent'];
  console.log(updatedGeocoderAgent?.prompt || 'No prompt found');
  
  // Highlight the changes
  console.log('\n\n=== CHANGES SUMMARY ===');
  console.log('Changed fields for geocoder-agent:');
  console.log('1. Description updated ✓');
  console.log('2. Prompt now includes CRITICAL ERROR HANDLING section ✓');
  console.log('3. Explicit "DO NOT provide fallback coordinates" instruction ✓');
  
  // Show key differences
  console.log('\n--- KEY DIFFERENCES ---');
  console.log('Original description:', originalGeocoderAgent?.description);
  console.log('Updated description:', updatedGeocoderAgent?.description);
  
  const hasErrorHandling = updatedGeocoderAgent?.prompt?.includes('CRITICAL ERROR HANDLING');
  const hasDoNotFallback = updatedGeocoderAgent?.prompt?.includes('DO NOT provide fallback');
  
  console.log('\nPrompt analysis:');
  console.log('  Has error handling section:', hasErrorHandling);
  console.log('  Has "DO NOT provide fallback" rule:', hasDoNotFallback);
  console.log('  Original prompt length:', originalGeocoderAgent?.prompt?.length || 0, 'chars');
  console.log('  Updated prompt length:', updatedGeocoderAgent?.prompt?.length || 0, 'chars');
  
  // Show the metadata
  console.log('\n--- METADATA ---');
  console.log('Agent ID:', updatedDefinition.id);
  console.log('Number of sub-agents:', Object.keys(updatedDefinition.subAgents || {}).length);
  console.log('Updated at:', updatedDefinition.updatedAt);
}

// Run it
demoEditAndShow().catch(console.error);

