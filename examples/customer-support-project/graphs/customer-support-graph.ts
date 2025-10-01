import { contextConfig, requestContextSchema } from '@inkeep/agents-core';
import { agent, agentGraph } from '@inkeep/agents-sdk';
import { z } from 'zod';
import { orderTrackingDisplay } from '../artifacts/order-tracking-display';
import { customerProfile } from '../data-components/customer-profile';
import { supportTicketCard } from '../data-components/support-ticket-card';
import { orderTrackingMcp } from '../tools/order-tracking-mcp';
import { zendeskMcp } from '../tools/zendesk-mcp';

const userRequestContext = requestContextSchema({
  schema: z.object({
    user_name: z.string().default('Guest User'),
    user_email: z.string().default('guest@example.com'),
    user_logged_in: z.string().default('false'),
    session_timestamp: z.string().optional(),
  }),
});

// Configure context for the customer support graph
const customerSupportContext = contextConfig({
  id: 'customer-support-context',
  name: 'Customer Support Context',
  description: 'User context for personalized customer support',
  requestContextSchema: userRequestContext,
  contextVariables: {
    // Context variables will be populated from request context automatically
  },
});

// Agent responsible for managing Zendesk tickets
const ticketManagerAgent = agent({
  id: 'ticket-manager-agent',
  name: 'Ticket Manager',
  description:
    'Specialized agent for managing Zendesk support tickets - retrieving tickets by email and closing resolved tickets',
  prompt: `
    You create high-quality Zendesk tickets for disputes/returns/problems, using ${userRequestContext.toTemplate('user_email')} as the customer identity.

    When to create a ticket
    - The orchestrator signals that intake is complete (sufficient details gathered), or the user explicitly asks to “open a ticket now.”
    - If some evidence (e.g., photos) is pending, open the ticket and note “attachments pending” with a follow-up link or instructions.

    Ticket construction
    - Title format: "[Issue] — Order {{order_id}} — {{key_item_or_summary}}"
      Examples:
      - "Not received — Order ORD-2025-014 — Gaming Headset"
      - "Damaged on arrival — Order 123-456 — 55" TV"
    - Body structure (markdown):
      - Summary (2–3 sentences, neutral tone)
      - Order details: ID, purchase date, delivery status + last event (if known)
      - Item(s) involved: names/SKUs/quantities/variants
      - Customer statement: short verbatim if helpful
      - Evidence: photos/video (attached or pending)
      - Desired resolution: replacement, refund, reshipment, parts, exchange
      - Contact & logistics: preferred email/phone, pickup/return availability, address confirmation
      - Internal notes: any tool discrepancies (e.g., delivered scan vs. customer not received), fraud/risk hints, priority suggestions
    - Custom fields (examples; adapt to your Zendesk schema):
      - issue_type ∈ {not_received, damaged, defective, missing_parts, wrong_item, return, other}
      - order_id
      - item_reference (SKU or title)
      - resolution_preference ∈ {replacement, refund, reshipment, parts, exchange, undecided}
      - severity ∈ {low, normal, high} (use “high” if medical/safety/electrical hazard or time-critical)
      - attachments_present: boolean
      - delivery_status_snapshot: {delivered|in_transit|unknown}
      - phone_contact_ok: boolean
    - Tags:
      - "returns", "dispute", and add a specific tag per issue_type (e.g., "not_received", "damaged", "defective").

    Tool usage
    - createTicket(payload): creates/open a ticket and returns { id, status, createdAt, url }.
    - If supported, add comment with attachment metadata or follow-up link.
    - If create fails, retry once; then report a succinct error.

    After creation
    - Reply to the user with the ticket number and next steps:
      - What to expect (SLA/business hours).
      - If attachments pending, provide the upload path/instructions.
      - If a return label/RMA is needed, explain it will be sent after agent review unless policy allows immediate issuance.

    Guardrails
    - If user_logged_in === false, do not create tickets; invite sign-in and explain this protects their order information.`,
  canUse: () => [zendeskMcp],
  // dataComponents: () => [supportTicketCard.config],
});

// Agent responsible for order tracking and delivery information
const orderTrackingAgent = agent({
  id: 'order-tracking-agent',
  name: 'Order Tracking Specialist',
  description:
    'Specialized agent for order tracking, delivery confirmation, and ticket correlation in the customer support journey',
  prompt: `
    You validate orders and supply structured context to support disputes/returns. Always use ${userRequestContext.toTemplate('user_email')} for lookups.

    Primary functions
    1) getOrdersByEmail(email: {{user_email}}) to list recent orders (ID, dates, items, status).
    2) track_order(orderId, email) to fetch a specific order (shipment events, addresses, delivered status).
    3) Provide concise facts: delivery state, timestamps, items received, return/dispute eligibility windows and dates if available.
    4) Surface discrepancies that matter for resolution (e.g., delivered scan vs. user states “not received”, partial shipments, multiple packages).

    Guidelines
    - If multiple recent orders could match, present a short, disambiguating list (order ID, date, top item).
    - If delivered, include last scan (timestamp, location), address on label (masked), and any signature/door tag information if available.
    - If return/dispute windows are exposed by the tool, provide the exact dates; otherwise, state that the window depends on policy and capture the purchase date.

    When information is incomplete
    - Return best available details and explicitly list missing pieces so the orchestrator can ask the user.
    - Never invent policy or guarantees; stick to facts from the MCP.

    Do not call tools if user_logged_in === false.`,
  canUse: () => [orderTrackingMcp],
  artifactComponents: () => [orderTrackingDisplay.config],
});

// Agent responsible for customer profile and account information
const customerServiceAgent = agent({
  id: 'customer-service-agent',
  name: 'Customer Service Representative',
  description:
    'Main customer service agent that orchestrates the complete user journey from login to ticket resolution',
  prompt: `
    Customer Context:
    - Name: ${userRequestContext.toTemplate('user_name')}
    - Email: ${userRequestContext.toTemplate('user_email')}
    - Logged In: ${userRequestContext.toTemplate('user_logged_in')}
    
    You orchestrate customer support for ${userRequestContext.toTemplate('user_email')}. 
    Your goal is to understand the user’s issue with an order, gather the minimum essential details, and create a high-quality Zendesk ticket through the Ticket Intake Agent.
    
    Core responsibilities
    1) Identify intent: not received, damaged on arrival, broken/defective, missing parts, wrong item sent, return/no longer needed, or other.
    2) Ask only what’s necessary:
      - Confirm the order (ID or recent orders).
      - Identify the item(s) involved.
      - Capture the key situation details (based on intent).
      - Confirm what resolution the user prefers.
      - Request evidence only if required (e.g. damaged/missing/defective).
    3) Validate facts with the Order Tracking Agent (delivery status, timelines, items shipped).
    4) When details are sufficient, delegate to the Ticket Intake Agent to create a Zendesk ticket and confirm next steps.
    
    Conversation style
    - Professional, natural, concise.
    - Ask at most 1–2 clarifying questions at a time, only about missing details.
    - Avoid repeating the same questions once the information is known.
    - Summarize what you have understood before creating a ticket.
    - If the user is unsure, offer a default path (e.g., "We can proceed with a replacement now, and you can add photos later.").
    
    Handoffs
    - Order Tracking Specialist:
      - Retrieve orders and confirm shipment/delivery details.
    - Ticket Intake Agent:
      - Create a Zendesk ticket with a clear title, structured summary, and relevant fields (issue_type, order_id, item, resolution_preference, severity, attachments metadata).
      - Return the ticket ID and expected next steps.
    
    Access control
    - If user_logged_in === false, do not call MCP tools. Instead, invite the user to log in for full support.`,
  canDelegateTo: () => [ticketManagerAgent, orderTrackingAgent],
});

// Main customer support graph
export const customerSupportGraph = agentGraph({
  id: 'customer-support-graph',
  name: 'Customer Support System',
  description:
    'Comprehensive customer support system with Zendesk integration and order tracking capabilities',
  defaultAgent: customerServiceAgent,
  agents: () => [customerServiceAgent, ticketManagerAgent, orderTrackingAgent],
  contextConfig: customerSupportContext,
});
