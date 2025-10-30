import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { NextRequest } from "next/server";

// Store headers globally for access in tools
let currentRequestHeaders: Headers | null = null;

// Helper function to create Zendesk API request
async function makeZendeskRequest(
  endpoint: string,
  method: string = "GET",
  ZENDESK_SUBDOMAIN: string,
  ZENDESK_EMAIL: string,
  ZENDESK_TOKEN: string,
  data?: any
) {
  const url = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2${endpoint}`;
  const credentials = Buffer.from(
    `${ZENDESK_EMAIL}/token:${ZENDESK_TOKEN}`
  ).toString("base64");

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  };

  if (data && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Zendesk API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

// StreamableHttp server
const handler = createMcpHandler(
  async (server) => {
    server.tool(
      "create_zendesk_ticket",
      "Create a new Zendesk support ticket with the specified details",
      {
        subject: z.string().describe("The subject/title of the ticket"),
        description: z
          .string()
          .describe("The detailed description of the issue or request"),
        requester_id: z
          .number()
          .optional()
          .describe("Optional requester user ID"),
        assignee_id: z
          .number()
          .optional()
          .describe("Optional assignee user ID"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("Ticket priority level"),
        type: z
          .enum(["problem", "incident", "question", "task"])
          .optional()
          .describe("Type of ticket"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional list of tags to categorize the ticket"),
      },
      async ({
        subject,
        description,
        requester_id,
        assignee_id,
        priority,
        type,
        tags,
      }) => {
        try {
          const ticketData: any = {
            ticket: {
              subject,
              description,
              requester_id,
              assignee_id,
              priority,
              type,
              tags,
            },
          };

          let ZENDESK_SUBDOMAIN;
          let ZENDESK_EMAIL;
          let ZENDESK_TOKEN;

          // Access headers in the tool
          if (currentRequestHeaders) {
            console.log("=== Headers available in tool ===");
            currentRequestHeaders.forEach((value, key) => {
              console.log(`  ${key}: ${value}`);
            });

            ZENDESK_SUBDOMAIN = currentRequestHeaders.get("zendesk-subdomain");
            ZENDESK_EMAIL = currentRequestHeaders.get("zendesk-email");
            ZENDESK_TOKEN = currentRequestHeaders.get("zendesk-token");
          }

          if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_TOKEN) {
            throw new Error(
              "One or more Zendesk credentials not found in headers: must have zendesk-subdomain, zendesk-email, and zendesk-token"
            );
          }

          const result = await makeZendeskRequest(
            "/tickets.json",
            "POST",
            ZENDESK_SUBDOMAIN,
            ZENDESK_EMAIL,
            ZENDESK_TOKEN,
            ticketData
          );

          return {
            content: [
              {
                type: "text",
                text:
                  `Successfully created Zendesk ticket #${result.ticket.id}:\n\n` +
                  `Subject: ${result.ticket.subject}\n` +
                  `Status: ${result.ticket.status}\n` +
                  `Priority: ${result.ticket.priority || "normal"}\n` +
                  `Type: ${result.ticket.type || "question"}\n` +
                  `Created: ${result.ticket.created_at}\n` +
                  `URL: https://${ZENDESK_SUBDOMAIN}.zendesk.com/agent/tickets/${result.ticket.id}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create Zendesk ticket: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "get_zendesk_ticket",
      "Retrieve details of a specific Zendesk ticket by ID",
      {
        ticket_id: z.number().describe("The ID of the ticket to retrieve"),
      },
      async ({ ticket_id }) => {
        try {
          let ZENDESK_SUBDOMAIN;
          let ZENDESK_EMAIL;
          let ZENDESK_TOKEN;

          // Access headers in the tool
          if (currentRequestHeaders) {
            console.log("=== Headers available in tool ===");
            currentRequestHeaders.forEach((value, key) => {
              console.log(`  ${key}: ${value}`);
            });

            ZENDESK_SUBDOMAIN = currentRequestHeaders.get("zendesk-subdomain");
            ZENDESK_EMAIL = currentRequestHeaders.get("zendesk-email");
            ZENDESK_TOKEN = currentRequestHeaders.get("zendesk-token");
          }

          if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_TOKEN) {
            throw new Error(
              "One or more Zendesk credentials not found in headers: must have zendesk-subdomain, zendesk-email, and zendesk-token"
            );
          }

          const result = await makeZendeskRequest(
            `/tickets/${ticket_id}.json`,
            "GET",
            ZENDESK_SUBDOMAIN,
            ZENDESK_EMAIL,
            ZENDESK_TOKEN
          );
          return {
            content: [
              {
                type: "text",
                text:
                  `Zendesk Ticket #${result.ticket.id}:\n\n` +
                  `Subject: ${result.ticket.subject}\n` +
                  `Status: ${result.ticket.status}\n` +
                  `Priority: ${result.ticket.priority}\n` +
                  `Type: ${result.ticket.type}\n` +
                  `Description: ${result.ticket.description}\n` +
                  `Requester ID: ${result.ticket.requester_id}\n` +
                  `Assignee ID: ${result.ticket.assignee_id}\n` +
                  `Created: ${result.ticket.created_at}\n` +
                  `Updated: ${result.ticket.updated_at}\n` +
                  `Tags: ${result.ticket.tags?.join(", ") || "None"}\n` +
                  `URL: https://${ZENDESK_SUBDOMAIN}.zendesk.com/agent/tickets/${result.ticket.id}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve ticket #${ticket_id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "update_zendesk_ticket",
      "Update an existing Zendesk ticket with new information",
      {
        ticket_id: z.number().describe("The ID of the ticket to update"),
        subject: z.string().optional().describe("New subject for the ticket"),
        status: z
          .enum(["new", "open", "pending", "hold", "solved", "closed"])
          .optional()
          .describe("New status for the ticket"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .optional()
          .describe("New priority for the ticket"),
        assignee_id: z.number().optional().describe("New assignee user ID"),
        tags: z
          .array(z.string())
          .optional()
          .describe("New tags for the ticket"),
        comment: z
          .string()
          .optional()
          .describe("Optional comment to add to the ticket"),
      },
      async ({
        ticket_id,
        subject,
        status,
        priority,
        assignee_id,
        tags,
        comment,
      }) => {
        try {
          const updateData: any = {
            ticket: {},
          };

          if (subject !== undefined) updateData.ticket.subject = subject;
          if (status !== undefined) updateData.ticket.status = status;
          if (priority !== undefined) updateData.ticket.priority = priority;
          if (assignee_id !== undefined)
            updateData.ticket.assignee_id = assignee_id;
          if (tags !== undefined) updateData.ticket.tags = tags;
          if (comment !== undefined) {
            updateData.ticket.comment = {
              body: comment,
              public: true,
            };
          }

          let ZENDESK_SUBDOMAIN;
          let ZENDESK_EMAIL;
          let ZENDESK_TOKEN;

          // Access headers in the tool
          if (currentRequestHeaders) {
            console.log("=== Headers available in tool ===");
            currentRequestHeaders.forEach((value, key) => {
              console.log(`  ${key}: ${value}`);
            });

            ZENDESK_SUBDOMAIN = currentRequestHeaders.get("zendesk-subdomain");
            ZENDESK_EMAIL = currentRequestHeaders.get("zendesk-email");
            ZENDESK_TOKEN = currentRequestHeaders.get("zendesk-token");
          }

          if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_TOKEN) {
            throw new Error(
              "One or more Zendesk credentials not found in headers: must have zendesk-subdomain, zendesk-email, and zendesk-token"
            );
          }

          await makeZendeskRequest(
            `/tickets/${ticket_id}.json`,
            "PUT",
            ZENDESK_SUBDOMAIN,
            ZENDESK_EMAIL,
            ZENDESK_TOKEN,
            updateData
          );

          return {
            content: [
              {
                type: "text",
                text: `Successfully updated Zendesk ticket #${ticket_id}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to update ticket #${ticket_id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "list_zendesk_tickets",
      "Retrieve a list of Zendesk tickets with optional filtering",
      {
        page: z
          .number()
          .optional()
          .describe("Page number for pagination (default: 1)"),
        per_page: z
          .number()
          .optional()
          .describe("Number of tickets per page (max 100, default: 25)"),
        sort_by: z
          .enum(["created_at", "updated_at", "priority", "status"])
          .optional()
          .describe("Field to sort by"),
        sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
        status: z
          .enum(["new", "open", "pending", "hold", "solved", "closed"])
          .optional()
          .describe("Filter by ticket status"),
        assignee_id: z.number().optional().describe("Filter by assignee ID"),
      },
      async ({
        page = 1,
        per_page = 25,
        sort_by = "created_at",
        sort_order = "desc",
        status,
        assignee_id,
      }) => {
        try {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: Math.min(per_page, 100).toString(),
            sort_by,
            sort_order,
          });

          if (status) params.append("status", status);
          if (assignee_id) params.append("assignee_id", assignee_id.toString());

          let ZENDESK_SUBDOMAIN;
          let ZENDESK_EMAIL;
          let ZENDESK_TOKEN;

          // Access headers in the tool
          if (currentRequestHeaders) {
            console.log("=== Headers available in tool ===");
            currentRequestHeaders.forEach((value, key) => {
              console.log(`  ${key}: ${value}`);
            });

            ZENDESK_SUBDOMAIN = currentRequestHeaders.get("zendesk-subdomain");
            ZENDESK_EMAIL = currentRequestHeaders.get("zendesk-email");
            ZENDESK_TOKEN = currentRequestHeaders.get("zendesk-token");
          }

          if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_TOKEN) {
            throw new Error(
              "One or more Zendesk credentials not found in headers: must have zendesk-subdomain, zendesk-email, and zendesk-token"
            );
          }

          const result = await makeZendeskRequest(
            `/tickets.json?${params.toString()}`,
            "GET",
            ZENDESK_SUBDOMAIN,
            ZENDESK_EMAIL,
            ZENDESK_TOKEN
          );

          const ticketsList = result.tickets
            .map(
              (ticket: any) =>
                `#${ticket.id}: ${ticket.subject} (${ticket.status}, ${ticket.priority})`
            )
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text:
                  `Found ${result.tickets.length} tickets:\n\n${ticketsList}\n\n` +
                  `Page: ${page} | Per page: ${per_page} | Sort: ${sort_by} ${sort_order}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve tickets: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );
  },
  {
    capabilities: {
      tools: {
        create_zendesk_ticket: {
          description: "Create a new Zendesk support ticket",
        },
        get_zendesk_ticket: {
          description: "Retrieve details of a specific Zendesk ticket",
        },
        update_zendesk_ticket: {
          description: "Update an existing Zendesk ticket",
        },
        list_zendesk_tickets: {
          description: "List Zendesk tickets with optional filtering",
        },
      },
    },
  },
  {
    basePath: "/zendesk",
    verboseLogs: true,
    maxDuration: 60,
    disableSse: true,
  }
);

// Wrap the handler to capture headers and pass them to tools
const wrappedHandler = async (request: NextRequest) => {
  // Store headers globally so tools can access them
  currentRequestHeaders = request.headers;

  return handler(request);
};

export {
  wrappedHandler as GET,
  wrappedHandler as POST,
  wrappedHandler as DELETE,
};