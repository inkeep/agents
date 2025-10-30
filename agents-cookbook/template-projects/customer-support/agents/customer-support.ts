import { agent, subAgent } from "@inkeep/agents-sdk";
import { knowledgeBaseMcpTool } from "../tools/knowledge-base-mcp";
import { zendeskMcpTool } from "../tools/zendesk-mcp";
import { zendeskTicketCard } from "../data-components/ticketcard-data";

/**
 * Customer Support Agent
 *
 * This agent is responsible for handling customer support inquiries using the internal knowledge base and Zendesk.
 *
 * Important: Fill out the proper headers for the Zendesk tool below.
 */

// Knowledge Base Q&A Agent
const knowledgeBaseAgent = subAgent({
  id: "knowledge-base-agent",
  name: "Knowledge Base Agent",
  description: "Answers questions using the internal knowledge base",
  prompt: `You are a helpful assistant that answers questions using the internal knowledge base.
    Use the knowledge base tool to find relevant information.
    If you cannot find a satisfactory answer, clearly indicate that you need to escalate to Zendesk support.`,
  canUse: () => [knowledgeBaseMcpTool],
});

// Zendesk Support Agent
const zendeskAgent = subAgent({
  id: "zendesk-agent",
  name: "Zendesk Support Agent",
  description: "Handles customer support inquiries using Zendesk",
  prompt: `You are a helpful customer support agent with access to Zendesk.
    Use the Zendesk tool to help resolve customer inquiries, create tickets, and manage support cases.
    Always be professional and thorough in your responses.`,
  canUse: () => [
   zendeskMcpTool.with({
      selectedTools: ["create_zendesk_ticket"],
      headers: {
        "zendesk-subdomain": "{{YOUR_ZENDESK_SUBDOMAIN}}",
        "zendesk-email": "{{YOUR_ZENDESK_EMAIL}}",
        "zendesk-token": "{{YOUR_ZENDESK_TOKEN}}",
      },
    }),
  ],
});

// Main Customer Support Coordinator Agent
const customerSupportCoordinator = subAgent({
  id: "customer-support-coordinator",
  name: "Customer Support Coordinator",
  description: "Coordinates between knowledge base and Zendesk support",
  prompt: `You are the main customer support coordinator.
    For each inquiry:
    1. First, delegate to the knowledge base agent to find answers from internal documentation
    2. If the knowledge base agent cannot provide a satisfactory answer, delegate to the Zendesk agent
    3. Ensure smooth handoff between agents and maintain context throughout the conversation`,
  canDelegateTo: () => [knowledgeBaseAgent, zendeskAgent],
  dataComponents: () => [zendeskTicketCard],
});

// Top-level Customer Support Agent
export const customerSupport = agent({
  id: "customer-support",
  name: "Customer Support",
  description:
    "Comprehensive customer support system with knowledge base and Zendesk integration",
  defaultSubAgent: customerSupportCoordinator,
  subAgents: () => [
    customerSupportCoordinator,
    knowledgeBaseAgent,
    zendeskAgent,
  ],
});
