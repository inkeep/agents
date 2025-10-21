import { weatherAgent } from '../examples/weather-project/agents/weather-agent';

/**
 * Example: How an LLM would edit an agent based on evaluation feedback
 * 
 * Scenario: The geocoder-agent is providing fallback coordinates when the geocode
 * tool fails. The eval shows this is problematic - it should report errors instead.
 */

async function llmEditAgentFromEvalFeedback() {
  console.log('=== LLM Agent Editing Workflow ===\n');
  
  // Step 1: Initialize the agent
  console.log('Step 1: Initializing agent...');
  await weatherAgent.init();
  
  // Step 2: Get the editable definition (what the LLM sees)
  console.log('Step 2: Getting editable definition for LLM...');
  const editableDefinition = await weatherAgent.toEditableDefinition();
  
  console.log('\nEditable Definition Summary:');
  console.log(JSON.stringify(editableDefinition._summary, null, 2));
  
  // Step 3: LLM analyzes eval feedback and current configuration
  console.log('\n\nStep 3: LLM analyzes evaluation feedback...');
  console.log('Feedback: "geocoder-agent should not provide fallback coordinates when tool fails"');
  
  console.log('\n\nCurrent geocoder-agent prompt:');
  const geocoderAgent = editableDefinition.agents.find((a: any) => a.id === 'geocoder-agent');
  console.log(geocoderAgent?.prompt);
  
  // Step 4: LLM identifies the issue and generates a fix
  console.log('\n\nStep 4: LLM generates improved prompt...');
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
  
  console.log('New prompt includes explicit error handling instructions ✓');
  
  // Step 5: Apply the edits using the new method
  console.log('\n\nStep 5: Applying edits to agent configuration...');
  await weatherAgent.updateFromEditableDefinition({
    agents: [
      {
        id: 'geocoder-agent',
        prompt: improvedPrompt
      }
    ]
  });
  
  console.log('✓ Agent configuration updated successfully');
  
  // Step 6: Verify the changes
  console.log('\n\nStep 6: Verifying changes...');
  const updatedDefinition = await weatherAgent.toEditableDefinition();
  const updatedGeocoderAgent = updatedDefinition.agents.find((a: any) => a.id === 'geocoder-agent');
  
  const hasErrorHandling = updatedGeocoderAgent?.prompt.includes('DO NOT provide fallback');
  console.log(`✓ Error handling instructions present: ${hasErrorHandling}`);
  
  // Step 7: Agent is now ready to be re-evaluated
  console.log('\n\nStep 7: Agent ready for re-evaluation');
  console.log('The geocoder-agent will now:');
  console.log('  - Report errors when the geocode tool fails');
  console.log('  - NOT provide hardcoded fallback coordinates');
  console.log('  - Guide users to try again or provide more details');
  
  console.log('\n\n=== Editing Complete ===');
  console.log('The agent can now be re-run through the eval to verify the fix.');
}

/**
 * Example: More complex editing scenario
 * An LLM might want to update multiple aspects based on eval results
 */
async function complexEditingExample() {
  console.log('\n\n=== Complex Editing Example ===\n');
  
  await weatherAgent.init();
  
  console.log('Scenario: Eval shows multiple issues to fix...\n');
  
  await weatherAgent.updateFromEditableDefinition({
    // Update the main configuration
    configuration: {
      prompt: 'You are an enhanced weather assistant with improved error handling...'
    },
    
    // Update multiple agents at once
    agents: [
      {
        id: 'geocoder-agent',
        prompt: 'Improved geocoder instructions with error handling...'
      },
      {
        id: 'weather-forecaster',
        prompt: 'Enhanced weather forecaster with better formatting...'
      }
    ]
  });
  
  console.log('✓ Multiple agents updated in one operation');
}

/**
 * Example: What the editing guide tells the LLM
 */
function showEditingGuide() {
  console.log('\n\n=== What LLM Sees in _editingGuide ===\n');
  
  const guide = {
    purpose: 'This format is designed for AI agents to understand and modify agent configurations',
    editableFields: {
      configuration: {
        prompt: 'System instructions that guide the agent behavior'
      },
      agents: {
        description: 'Sub-agents are specialized agents that handle specific tasks',
        fields: {
          prompt: 'Specific instructions for this sub-agent'
        }
      }
    },
    bestPractices: {
      prompts: [
        'Be specific and clear about the agent\'s role and constraints',
        'Include examples of desired behavior',
        'Define success criteria',
        'Specify error handling procedures'
      ]
    }
  };
  
  console.log(JSON.stringify(guide, null, 2));
}

if (require.main === module) {
  llmEditAgentFromEvalFeedback()
    .then(() => complexEditingExample())
    .then(() => showEditingGuide())
    .catch(console.error);
}

export { llmEditAgentFromEvalFeedback, complexEditingExample, showEditingGuide };

