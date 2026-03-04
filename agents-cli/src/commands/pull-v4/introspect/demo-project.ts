export const demoProject = {
  id: 'demo-project',
  name: 'demo-project',
  description: 'To demo how to build an agent',
  models: {
    base: { model: 'anthropic/claude-sonnet-4-5' },
    summarizer: { model: 'anthropic/claude-sonnet-4-5' },
    structuredOutput: { model: 'anthropic/claude-sonnet-4-5' },
  },
  stopWhen: {},
  agents: {
    'advanced-meeting-prep-agent': {
      id: 'advanced-meeting-prep-agent',
      name: 'Advanced Meeting Prep Agent',
      description: null,
      defaultSubAgentId: null,
      subAgents: {},
      createdAt: '2025-12-17T23:02:55.859Z',
      updatedAt: '2025-12-17T23:02:55.859Z',
      tools: {},
      functionTools: {},
    },
    custodial: {
      id: 'custodial',
      name: 'Custodial',
      description: null,
      defaultSubAgentId: null,
      subAgents: {},
      createdAt: '2026-01-07T18:46:18.739Z',
      updatedAt: '2026-01-07T18:46:18.739Z',
      tools: {},
      functionTools: {},
    },
    'kevin-mira-gong-transcripts': {
      id: 'kevin-mira-gong-transcripts',
      name: 'Kevin Mira - Gong Transcripts',
      description: null,
      defaultSubAgentId: 'inkeepgong',
      subAgents: {
        inkeepgong: {
          id: 'inkeepgong',
          name: 'InkeepGong',
          description:
            'This agent is responsible for reviewing customer calls/transcripts from Gong to create messaging based on customer language - challenges, terms, etc. ',
          prompt: '',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
      },
      createdAt: '2026-01-09T19:18:32.670Z',
      updatedAt: '2026-01-09T19:19:47.277Z',
      stopWhen: { transferCountIs: 10 },
      tools: {},
      functionTools: {},
    },
    'ashby-role-descriptions': {
      id: 'ashby-role-descriptions',
      name: 'Ashby-role-descriptions',
      description: null,
      defaultSubAgentId: 'role-description-generator',
      subAgents: {
        'role-description-generator': {
          id: 'role-description-generator',
          name: 'Role Description Generator',
          description:
            'Fetches open roles from Ashby and generates updated role descriptions using Inkeep knowledge base',
          prompt:
            'You are a role description generator that creates comprehensive, up-to-date job descriptions.\n' +
            '\n' +
            '<workflow>\n' +
            '1. Fetch all open jobs from Ashby using ASHBY_LIST_JOBS or ASHBY_LIST_JOB_POSTINGS\n' +
            '2. For each open role:\n' +
            '   - Extract the job title and key details\n' +
            '   - Search Inkeep knowledge base for relevant information about:\n' +
            '     * Required skills and qualifications\n' +
            '     * Company culture and values\n' +
            '     * Team structure and responsibilities\n' +
            '     * Technologies and tools used\n' +
            '   - Generate an updated, comprehensive role description combining:\n' +
            '     * Original job details from Ashby\n' +
            '     * Enhanced context from Inkeep knowledge base\n' +
            '3. Present all updated role descriptions clearly\n' +
            '</workflow>\n' +
            '\n' +
            '<rules>\n' +
            '- Always fetch the latest open roles from Ashby first\n' +
            '- Cross-reference each role with Inkeep knowledge base\n' +
            '- Create detailed, accurate descriptions\n' +
            '- Highlight key requirements and responsibilities\n' +
            '- Include relevant company/team context\n' +
            '- Format descriptions professionally\n' +
            '</rules>',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'vq890ku1bmwop8wz6bnf9',
              toolId: 'c7kdb6dt92nyb80ub2rng',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-17T23:19:22.295Z',
      updatedAt: '2025-12-17T23:22:54.756Z',
      tools: {
        c7kdb6dt92nyb80ub2rng: {
          id: 'c7kdb6dt92nyb80ub2rng',
          name: 'Inkeep Enterprise Search MCP',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.inkeep.com/inkeep/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
        },
      },
      functionTools: {},
    },
    'customer-support': {
      id: 'customer-support',
      name: 'Customer Support',
      description:
        'Comprehensive customer support system with knowledge base and Zendesk integration',
      defaultSubAgentId: 'customer-support-coordinator',
      subAgents: {
        'customer-support-coordinator': {
          id: 'customer-support-coordinator',
          name: 'Customer Support Coordinator',
          description: 'Coordinates between knowledge base and Zendesk support',
          prompt:
            'You are the main customer support coordinator.\n' +
            'For each inquiry follow these steps without repeating any:\n' +
            '\n' +
            '1. Delegate to the Knowledge Base agent to search internal docs and draft an answer.\n' +
            '\n' +
            '2. If the Knowledge Base agent indicates escalation (e.g., explicitly says it needs to escalate to the zendesk-support-agent), delegate to the zendesk-support-agent to create a zendesk ticket.\n' +
            '\n' +
            '3. Pass full context and KB findings to Zendesk so the customer never has to repeat themselves.\n' +
            '\n' +
            '4. Return a single final response using the best available info and next steps.',
          models: { base: { model: 'openai/gpt-5.2' } },
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['knowledge-base-agent', 'zendesk-support-agent'],
          skills: [],
          dataComponents: ['zendeskticketcard'],
          artifactComponents: [],
          canUse: [],
        },
        'knowledge-base-agent': {
          id: 'knowledge-base-agent',
          name: 'Knowledge Base Agent',
          description: 'Answers questions using the internal knowledge base',
          prompt:
            'ou are a helpful assistant that answers questions using the internal knowledge base.\n' +
            '\n' +
            'Always respond with a draft customer-facing answer based on what you find.\n' +
            '\n' +
            'If you cannot find a satisfactory answer, or the docs imply “contact support / contact our support team,” draft a brief escalation note instead, clearly stating that you need to escalate to the zendesk-support-agent',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '78hfc4m1891z270qtdaye',
              toolId: 'c7kdb6dt92nyb80ub2rng',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'zendesk-support-agent': {
          id: 'zendesk-support-agent',
          name: 'Zendesk Support Agent',
          description: 'Handles customer support inquiries using Zendesk',
          prompt:
            'You are a helpful assistant that answers questions using the internal knowledge base.\n' +
            '\n' +
            'Always respond in one of these two formats:\n' +
            '\n' +
            'If you find a satisfactory answer:\n' +
            'DRAFT_RESPONSE: <draft customer-facing answer>\n' +
            '\n' +
            'If you cannot find a satisfactory answer, or docs imply contacting support:\n' +
            'ESCALATE_ZENDESK: <brief reason why escalation is needed>',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '08rw7pfv33irvimi1oc2k',
              toolId: 'rjziaq0tono242cg91cvx',
              toolSelection: ['create_zendesk_ticket'],
              headers: {
                'zendesk-email': 'nick@inkeep.com',
                'zendesk-token': 'IIOFHd4ocCTtXKLDbOqSV0x4G8Q3d2MJujOORnDp',
                'zendesk-subdomain': 'd3v-inkeep',
              },
              toolPolicies: {},
            },
            {
              agentToolRelationId: 'cab9sam632xyiy2zdw3rt',
              toolId: 'svclt7yv8fg0dgtku6wm2',
              toolSelection: ['notion-update-page'],
              headers: null,
              toolPolicies: {},
            },
          ],
        },
      },
      createdAt: '2025-12-10T17:45:02.920Z',
      updatedAt: '2025-12-18T14:23:51.716Z',
      models: { base: { model: 'openai/gpt-5.2' } },
      statusUpdates: { numEvents: 10, timeInSeconds: 30 },
      stopWhen: { transferCountIs: 10 },
      tools: {
        svclt7yv8fg0dgtku6wm2: {
          id: 'svclt7yv8fg0dgtku6wm2',
          name: 'Notion',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.notion.com/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: null,
        },
        rjziaq0tono242cg91cvx: {
          id: 'rjziaq0tono242cg91cvx',
          name: 'Zendesk',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://zendesk-mcp-sand.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: '',
        },
        c7kdb6dt92nyb80ub2rng: {
          id: 'c7kdb6dt92nyb80ub2rng',
          name: 'Inkeep Enterprise Search MCP',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.inkeep.com/inkeep/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
        },
      },
      functionTools: {},
    },
    'data-analyst': {
      id: 'data-analyst',
      name: 'Data analyst',
      description: null,
      defaultSubAgentId: 'data-analyst',
      subAgents: {
        'data-analyst': {
          id: 'data-analyst',
          name: 'Data analyst',
          description: '',
          prompt:
            'This is the information about the project and table:\n' +
            '\n' +
            '  "project_id": "dnfesvponhadzqkqbmpp",\n' +
            '\n' +
            '  example query:\n' +
            '  "query": "SELECT * FROM world_happiness ORDER BY overall_rank ASC LIMIT 10"\n' +
            '\n' +
            '\n' +
            'And this is the table schema:\n' +
            '\n' +
            '          "raw": {\n' +
            '            "columns": [\n' +
            '              {\n' +
            '                "name": "overall_rank",\n' +
            '                "type": "integer",\n' +
            '                "nullable": false,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "country_or_region",\n' +
            '                "type": "character varying",\n' +
            '                "nullable": false,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "score",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": false,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "gdp_per_capita",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": true,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "social_support",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": true,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "healthy_life_expectancy",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": true,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "freedom_to_make_life_choices",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": true,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "generosity",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": true,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              },\n' +
            '              {\n' +
            '                "name": "perceptions_of_corruption",\n' +
            '                "type": "numeric",\n' +
            '                "nullable": true,\n' +
            '                "default": null,\n' +
            '                "description": null\n' +
            '              }\n' +
            '            ],\n' +
            '          },',
          models: { base: { model: 'openai/gpt-5' } },
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: ['scatterplot', 'bar-chart-of-happiness-scores'],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'gt4inccv91xepjlozg5qy',
              toolId: 'wtftp4mk9hk7c1zd5rdi3',
              toolSelection: ['execute_sql'],
              headers: null,
              toolPolicies: {},
            },
          ],
        },
      },
      createdAt: '2025-12-09T02:48:57.793Z',
      updatedAt: '2025-12-10T20:40:27.166Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        wtftp4mk9hk7c1zd5rdi3: {
          id: 'wtftp4mk9hk7c1zd5rdi3',
          name: 'Supabase (Gaurav Varma)',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.supabase.com/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: 'l3e51vzt5atfwymmu4ur5',
          imageUrl: null,
        },
      },
      functionTools: {},
    },
    'knowledge-agent': {
      id: 'knowledge-agent',
      name: 'Knowledge agent',
      description: null,
      defaultSubAgentId: 'knowledge-search-agent',
      subAgents: {
        'knowledge-search-agent': {
          id: 'knowledge-search-agent',
          name: 'Knowledge Search Agent',
          description: 'Searches the knowledge base and provides answers to user questions',
          prompt:
            'You are a helpful assistant that answers questions by searching the internal knowledge base.\n' +
            '\n' +
            'When a user asks a question:\n' +
            '1. Use the search tool to find relevant information from the knowledge base\n' +
            '2. Analyze the search results carefully\n' +
            '3. Provide a clear, accurate answer based on the information found\n' +
            '4. If the information found is incomplete or you cannot find a satisfactory answer, let the user know what you found and what additional information might be needed\n' +
            '\n' +
            "If the knowledge base tool can't answer the question then use the web search answer to find the answer online\n" +
            '\n' +
            'Always cite your sources and be transparent about the limitations of the information available.\n' +
            '\n' +
            'If the user asks about fundraising then use the basic-search tool.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['web-search-agent'],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'acwjzxg2iacobkwjnt6o7',
              toolId: 'c7kdb6dt92nyb80ub2rng',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'web-search-agent': {
          id: 'web-search-agent',
          name: 'Web search agent',
          description: 'Responsible for searching the web',
          prompt: 'Use the web search tool to search the web for answers',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'ausq8a0nyyyg5r14b8hzg',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: ['basic-search'],
              headers: null,
              toolPolicies: {},
            },
          ],
        },
      },
      createdAt: '2025-12-12T21:20:41.787Z',
      updatedAt: '2026-01-23T04:26:06.313Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        c7kdb6dt92nyb80ub2rng: {
          id: 'c7kdb6dt92nyb80ub2rng',
          name: 'Inkeep Enterprise Search MCP',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.inkeep.com/inkeep/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'matt-meeting-prep-agent': {
      id: 'matt-meeting-prep-agent',
      name: 'Matt - Meeting Prep Agent',
      description: null,
      defaultSubAgentId: 'meeting-prep-agent',
      subAgents: {
        'meeting-prep-agent': {
          id: 'meeting-prep-agent',
          name: 'Meeting Prep Coordinator',
          description:
            'Helps users prepare for meetings by finding them in Google Calendar and conducting relevant research',
          prompt:
            "You are a meeting preparation assistant. Today's date is {{CURRENT_DATE}}.\n" +
            '\n' +
            'When a user asks to prep for meetings:\n' +
            '\n' +
            '**CRITICAL WORKFLOW - FOLLOW EXACTLY:**\n' +
            '\n' +
            '1. **Find upcoming meetings**: Use Google Calendar to search for meetings happening in the next 1-2 days\n' +
            '   - Focus on external meetings (non-internal attendees)\n' +
            '   - Get meeting title, time, attendees, description\n' +
            '\n' +
            '2. **For EACH external meeting, you MUST conduct research using the web search tool**:\n' +
            '   - Research the company: what they do, recent news, size, products\n' +
            '   - Research attendees: their roles, background, recent posts/activities\n' +
            '   - Identify potential pain points, use cases, competitors\n' +
            '   - Find relevant talking points\n' +
            '\n' +
            '3. **Present a comprehensive prep brief for each meeting** that includes:\n' +
            '   - Meeting logistics (time, attendees, meeting link)\n' +
            '   - **Company Background**: What they do, recent news, key products\n' +
            "   - **Key People**: Who's attending, their roles and responsibilities\n" +
            '   - **Research Insights**: Pain points, opportunities, relevant context\n' +
            '   - **Suggested Talking Points**: Specific questions to ask and topics to discuss\n' +
            '   - **Recommended Approach**: How to position and handle the call\n' +
            '\n' +
            '**CRITICAL RULES:**\n' +
            '- NEVER just list meetings without researching them\n' +
            '- ALWAYS use web search to gather background information\n' +
            '- Be thorough and actionable - give the user real prep they can use\n' +
            '- Focus on external meetings that need preparation\n' +
            '- Provide specific, actionable advice, not generic tips\n' +
            '\n' +
            'Your goal: Make the user feel fully prepared and confident for their sales calls.',
          models: { base: { model: 'openai/gpt-4o' } },
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '23k0iczq6eoxznb6yxm2p',
              toolId: '6bb1ve7v75qokhqcp7p1r',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
            {
              agentToolRelationId: 'xg116sakzz6joe6eo4ljy',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-18T22:18:14.794Z',
      updatedAt: '2025-12-18T22:29:03.586Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        '6bb1ve7v75qokhqcp7p1r': {
          id: '6bb1ve7v75qokhqcp7p1r',
          name: 'Google Calendar MCP',
          description: null,
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://logos.composio.dev/api/googlecalendar',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'meeting-prep-agent': {
      id: 'meeting-prep-agent',
      name: 'Meeting prep agent',
      description: null,
      defaultSubAgentId: 'meeting-prep-coordinator',
      subAgents: {
        'company-research': {
          id: 'company-research',
          name: 'Company research',
          description: 'Research the company to understand what they do.\n',
          prompt:
            'Research the company to understand what they do.\n' +
            '\n' +
            '<workflow>\n' +
            '1. Exa: Scrape company website\n' +
            '   - Show key info found\n' +
            '2. Analyze:\n' +
            '   - What does company do?\n' +
            '   - Key products/services\n' +
            '   - Market position\n' +
            '3. Present summary with talking points\n' +
            '4. Return to coordinator\n' +
            '</workflow>\n' +
            '\n' +
            '<rules>\n' +
            '- Brief explanations under 200 chars\n' +
            '- Show findings immediately\n' +
            '- Proceed automatically\n' +
            '</rules>',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'f26mbzettj2hpxr9177bi',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'meeting-finder': {
          id: 'meeting-finder',
          name: 'Meeting finder',
          description: 'Find the external meeting to prep for using Google Calendar.\n',
          prompt:
            'Find the external meeting to prep for using Google Calendar.\n' +
            '\n' +
            '<workflow>\n' +
            '1. Search upcoming meetings for target company\n' +
            '2. Filter: ONLY meetings with external email domain (e.g., @nvidia.com)\n' +
            '3. Skip internal-only meetings entirely\n' +
            '4. Present first external meeting:\n' +
            '   - Date/time, duration\n' +
            '   - Title and link\n' +
            '   - External attendees (name + email)\n' +
            '   - Internal team (list all @inkeep.com emails)\n' +
            '5. Return to coordinator\n' +
            '</workflow>\n' +
            '\n' +
            '<rules>\n' +
            '- Never mention internal meetings\n' +
            '- Automatically use first external meeting found\n' +
            '- List all internal participant emails explicitly\n' +
            '- Return to coordinator after finding meeting\n' +
            '- Do not pass in a start_time parameter\n' +
            '</rules>',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
        'meeting-prep-coordinator': {
          id: 'meeting-prep-coordinator',
          name: 'Meeting prep coordinator',
          description: 'Orchestrate specialized agents to prepare for a meeting.\n',
          prompt:
            'Orchestrate specialized agents to prepare for a meeting.\n' +
            '\n' +
            '<workflow>\n' +
            '1. Greet & Find Meeting:\n' +
            '   - Greet user, understand which company\n' +
            '   - Announce: "Finding meeting with [Company]..."\n' +
            '   - Delegate to Meeting Finder\n' +
            '   - VERBOSE: Summarize meeting found (date, time, participants)\n' +
            '\n' +
            '2. Company Research:\n' +
            '   - Announce: "Researching [Company]..."\n' +
            '   - Delegate to Company research\n' +
            '   - VERBOSE: Summarize company insights (what they do, products)\n' +
            '\n' +
            '3. Create Prep:\n' +
            '   - Announce: "Creating prep summary..."\n' +
            '   - Encouraging closing message\n' +
            '</workflow>\n' +
            '\n' +
            '<rules>\n' +
            '- Always delegate in order: Meeting Finder → Company Research\n' +
            '- BE VERBOSE after each delegation returns\n' +
            '- Show progress and insights clearly\n' +
            '- Proceed automatically\n' +
            '</rules>',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['company-research', 'meeting-finder'],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
      },
      createdAt: '2025-11-26T01:33:51.717Z',
      updatedAt: '2025-12-18T14:26:29.485Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'meeting-prep-agent-gaurav': {
      id: 'meeting-prep-agent-gaurav',
      name: 'meeting-prep-agent-gaurav',
      description: null,
      defaultSubAgentId: 'meeting-coordinator',
      subAgents: {
        'meeting-coordinator': {
          id: 'meeting-coordinator',
          name: 'Meeting Prep Coordinator',
          description:
            'Orchestrates meeting preparation by coordinating calendar search and research tasks',
          prompt:
            'You are the Meeting Prep Coordinator. Your job is to help users prepare for meetings by:\n' +
            '\n' +
            '1. First, delegate to the Meeting Finder to search Google Calendar for the meeting\n' +
            '2. Once the meeting is found, delegate to the Research Agent to conduct web research on:\n' +
            '   - Pass down attendee and company information\n' +
            '   - The company/organization\n' +
            '   - The attendees (if known)\n' +
            '   - Relevant topics or context\n' +
            '3. Synthesize the findings into a comprehensive meeting prep brief\n' +
            '\n' +
            '\n' +
            '\n' +
            'Always be proactive and thorough. Ask clarifying questions if needed (which meeting, what company, etc.)',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['meeting-finder', 'research-agent'],
          skills: [],
          dataComponents: ['meeting-tips-card'],
          artifactComponents: [],
          canUse: [],
        },
        'meeting-finder': {
          id: 'meeting-finder',
          name: 'Meeting Finder',
          description: 'Searches Google Calendar to find meetings based on user queries',
          prompt:
            'You are the Meeting Finder. Your job is to search Google Calendar to find meetings.\n' +
            '\n' +
            'When asked to find a meeting:\n' +
            '1. Use GOOGLECALENDAR_FIND_EVENT to search for meetings\n' +
            "2. Look for meetings with keywords from the user's query (company name, person name, meeting topic)\n" +
            '3. Focus on upcoming meetings (use timeMin to search from today forward)\n' +
            '4. Return the meeting details including: title, time, attendees, location/link\n' +
            '5. If multiple meetings match, present the most relevant or upcoming one first\n' +
            '\n' +
            'Be helpful and thorough in your search.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'i7s3inpktrx4a6oowruky',
              toolId: '6bb1ve7v75qokhqcp7p1r',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'research-agent': {
          id: 'research-agent',
          name: 'Research Agent',
          description: 'Conducts web research to gather information for meeting preparation',
          prompt:
            'You are the Research Agent. Your job is to conduct thorough web research to help prepare for meetings.\n' +
            '\n' +
            'When given a research task:\n' +
            '1. Use the web search tools (basic-search or deep-search) to find information\n' +
            '2. Research multiple angles:\n' +
            '   - Company background, recent news, products/services\n' +
            '   - Key people involved (if known)\n' +
            '   - Industry trends or relevant context\n' +
            '   - Recent announcements or changes\n' +
            '3. Synthesize findings into clear, actionable insights\n' +
            '4. Focus on information that would be valuable for the meeting\n' +
            '\n' +
            'For comprehensive research, use deep-search. For quick lookups, use basic-search.\n' +
            'Always cite your sources and present information clearly.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'txc3yxepqz7e67yjhbcrs',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-18T22:18:18.421Z',
      updatedAt: '2025-12-18T23:02:51.737Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        '6bb1ve7v75qokhqcp7p1r': {
          id: '6bb1ve7v75qokhqcp7p1r',
          name: 'Google Calendar MCP',
          description: null,
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://logos.composio.dev/api/googlecalendar',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'meeting-prep-agent-heegun': {
      id: 'meeting-prep-agent-heegun',
      name: 'meeting-prep-agent-heegun',
      description: null,
      defaultSubAgentId: 'meeting-prep-coordinator',
      subAgents: {
        'meeting-finder': {
          id: 'meeting-finder',
          name: 'Meeting Finder',
          description: 'Finds upcoming meetings from Google Calendar',
          prompt:
            'You are a meeting finder assistant. When asked to find a meeting:\n' +
            '\n' +
            "1. Search the user's Google Calendar for upcoming meetings\n" +
            "2. Look for meetings that match the user's criteria (company name, person name, etc.)\n" +
            '3. Return the meeting details including:\n' +
            '   - Meeting title\n' +
            '   - Date and time\n' +
            '   - Attendees\n' +
            '   - Meeting link (if available)\n' +
            '   - Any meeting description or agenda\n' +
            '\n' +
            'Use the Google Calendar tools to search for and retrieve meeting information. Focus on finding the most relevant upcoming meeting based on what the user is asking about.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '7bssh9oqtuuxmn5t1fet6',
              toolId: '6bb1ve7v75qokhqcp7p1r',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'meeting-prep-coordinator': {
          id: 'meeting-prep-coordinator',
          name: 'Meeting Prep Coordinator',
          description:
            'Coordinates the meeting preparation workflow by delegating to meeting finder and web researcher',
          prompt:
            'You are a meeting preparation coordinator. When a user asks for help preparing for a meeting, follow this workflow:\n' +
            '\n' +
            '1. First, delegate to the Meeting Finder to search Google Calendar and find the relevant meeting\n' +
            '2. Once you have the meeting details, delegate to the Web Researcher to gather background information about:\n' +
            '   - The company/organization\n' +
            '   - Key attendees\n' +
            '   - Recent news or relevant context\n' +
            '3. Synthesize all the information into a comprehensive meeting prep brief that includes:\n' +
            '   - Meeting details (time, attendees, agenda)\n' +
            '   - Company/organization background\n' +
            '   - Key people information\n' +
            '   - Recent news or developments\n' +
            '   - Suggested talking points or areas to discuss\n' +
            '\n' +
            'Present the information in a clear, organized format that makes it easy for the user to quickly prepare for their meeting.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['meeting-finder', 'web-researcher'],
          skills: [],
          dataComponents: ['meeting-tips-card'],
          artifactComponents: [],
          canUse: [],
        },
        'web-researcher': {
          id: 'web-researcher',
          name: 'Web Researcher',
          description: 'Conducts web research to gather information for meeting preparation',
          prompt:
            'You are a web research assistant. When given information about a meeting, you:\n' +
            '\n' +
            '1. Research the company/organization involved in the meeting\n' +
            '2. Look up key attendees and their roles\n' +
            '3. Find recent news or developments about the company\n' +
            '4. Gather relevant industry information or context\n' +
            '5. Identify potential talking points or areas of interest\n' +
            '\n' +
            'Use the web search tool to find relevant, up-to-date information. Provide concise, actionable insights that will help prepare for the meeting. Focus on facts and avoid speculation.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'd9y1szl02jactyxrzmiaz',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-18T22:18:27.876Z',
      updatedAt: '2025-12-18T22:56:00.989Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        '6bb1ve7v75qokhqcp7p1r': {
          id: '6bb1ve7v75qokhqcp7p1r',
          name: 'Google Calendar MCP',
          description: null,
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://logos.composio.dev/api/googlecalendar',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    meetingprepagenkevinmira: {
      id: 'meetingprepagenkevinmira',
      name: 'MeetingPrepAgenKevinMira',
      description: null,
      defaultSubAgentId: 'meeting-prep-coordinator',
      subAgents: {
        'meeting-finder': {
          id: 'meeting-finder',
          name: 'Meeting Finder',
          description: 'Searches Google Calendar to find meetings based on user queries',
          prompt:
            'You are a meeting finder specialist. When a user asks about a meeting:\n' +
            '\n' +
            '1. Use Google Calendar tools to search for meetings that match their query\n' +
            '2. Look for keywords like company names, person names, meeting topics, or time references\n' +
            '3. Search upcoming meetings (from today forward) unless they specify a past date\n' +
            '4. Return clear meeting details including:\n' +
            '   - Meeting title\n' +
            '   - Date and time\n' +
            '   - Duration\n' +
            '   - Attendees (names and emails)\n' +
            '   - Meeting link (Zoom, Meet, etc.)\n' +
            '   - Any description or agenda\n' +
            '\n' +
            '5. If multiple meetings match, show the most relevant or upcoming ones\n' +
            '\n' +
            'Be thorough in extracting all useful information from the calendar event.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'nw1p2tjs0m9nt63xapndf',
              toolId: '6bb1ve7v75qokhqcp7p1r',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'meeting-prep-coordinator': {
          id: 'meeting-prep-coordinator',
          name: 'Meeting Prep Coordinator',
          description:
            'Orchestrates meeting preparation by coordinating calendar search and research',
          prompt:
            'You are a meeting preparation coordinator. When a user asks to prepare for a meeting:\n' +
            '\n' +
            '**Your Workflow:**\n' +
            '\n' +
            '1. First, delegate to the Meeting Finder to search Google Calendar for the meeting the user is asking about\n' +
            '2. Once you have the meeting details (time, attendees, company, agenda), delegate to the Web Researcher to conduct comprehensive research\n' +
            '3. Synthesize all information into a complete meeting prep brief\n' +
            '\n' +
            '**Your Final Brief Should Include:**\n' +
            '- **Meeting Details**: Date, time, duration, attendees, meeting link\n' +
            '- **Company Background**: What they do, recent news, key information\n' +
            "- **Key People**: Who's attending, their roles and background\n" +
            '- **Research Insights**: Relevant context, industry trends, potential topics\n' +
            '- **Suggested Approach**: Talking points, questions to ask, topics to discuss\n' +
            '\n' +
            '**Guidelines:**\n' +
            '- Always delegate to specialized sub-agents in sequence\n' +
            '- Wait for each delegation to complete before proceeding\n' +
            '- Synthesize findings into a cohesive, actionable brief\n' +
            '- Present information in a scannable, well-organized format\n' +
            '- Focus on practical insights that will help the user feel prepared\n' +
            '\n' +
            'Your goal: Make the user feel confident and fully prepared for their meeting.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['web-researcher', 'meeting-finder'],
          skills: [],
          dataComponents: ['meeting-tips-card'],
          artifactComponents: [],
          canUse: [],
        },
        'web-researcher': {
          id: 'web-researcher',
          name: 'Web Researcher',
          description: 'Conducts web research to gather information for meeting preparation',
          prompt:
            'You are a research specialist focused on meeting preparation. When given meeting details and attendees:\n' +
            '\n' +
            '1. Research the company/organization:\n' +
            '   - What they do (products, services, mission)\n' +
            '   - Recent news, announcements, or developments\n' +
            '   - Company size, funding, growth stage\n' +
            '   - Industry position and competitors\n' +
            '\n' +
            '2. Research key attendees:\n' +
            '   - Their roles and responsibilities\n' +
            '   - Professional background\n' +
            '   - Recent activities or posts (if publicly available)\n' +
            '\n' +
            '3. Identify relevant context:\n' +
            '   - Industry trends affecting them\n' +
            '   - Potential pain points or challenges\n' +
            '   - Relevant use cases or examples\n' +
            '   - Discussion topics that would be valuable\n' +
            '\n' +
            '4. Present findings in a clear, actionable format:\n' +
            '   - Company background\n' +
            '   - Key people information\n' +
            '   - Suggested talking points\n' +
            '   - Questions to ask\n' +
            '\n' +
            'Use web search tools to find authoritative, recent information. Focus on insights that will help make the meeting productive.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'nghrxcf8nl6mybrhlptc6',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-18T22:56:22.748Z',
      updatedAt: '2025-12-18T23:09:36.949Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        '6bb1ve7v75qokhqcp7p1r': {
          id: '6bb1ve7v75qokhqcp7p1r',
          name: 'Google Calendar MCP',
          description: null,
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://logos.composio.dev/api/googlecalendar',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'omar-nasser-agent': {
      id: 'omar-nasser-agent',
      name: 'Omar-Nasser-agent',
      description: null,
      defaultSubAgentId: 'meeting-prep-coordinator',
      subAgents: {
        'calendar-finder': {
          id: 'calendar-finder',
          name: 'Calendar Finder',
          description: 'Searches Google Calendar to find meetings',
          prompt:
            'You are a calendar search specialist. When the user asks about a meeting, use Google Calendar tools to:\n' +
            '\n' +
            "1. Search for meetings based on the user's description (keywords, attendees, date range)\n" +
            '2. Present the relevant meeting details including:\n' +
            '   - Meeting title\n' +
            '   - Date and time\n' +
            '   - Duration\n' +
            '   - Attendees\n' +
            '   - Meeting description/agenda if available\n' +
            '   - Meeting link (Zoom, Meet, etc.)\n' +
            '\n' +
            '3. If multiple meetings match, show the most relevant ones and ask which one they want to prepare for\n' +
            '\n' +
            'Be helpful and thorough in extracting meeting information.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'ya1tgflt65nf859wiglja',
              toolId: '6bb1ve7v75qokhqcp7p1r',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'meeting-prep-coordinator': {
          id: 'meeting-prep-coordinator',
          name: 'Meeting Prep Coordinator',
          description: 'Orchestrates the meeting preparation workflow',
          prompt:
            'You are the main coordinator for meeting preparation. When a user asks to prepare for a meeting:\n' +
            '\n' +
            '**Workflow:**\n' +
            '\n' +
            '1. First, delegate to the Calendar Finder to locate the meeting the user is asking about\n' +
            '2. Once the meeting is identified, gather the key details (who, what, when, where)\n' +
            '3. Then delegate to the Web Researcher to conduct research on:\n' +
            '   - The attendees or their companies (if external meeting)\n' +
            '   - The meeting topic or agenda items\n' +
            '   - Any relevant recent news or context\n' +
            '4. Synthesize all the information into a comprehensive meeting prep summary\n' +
            '\n' +
            '**Guidelines:**\n' +
            '- Always find the meeting first before researching\n' +
            '- Be proactive in identifying what research would be most valuable\n' +
            '- Present findings in a clear, scannable format\n' +
            '- Highlight the most important points for quick review\n' +
            '\n' +
            'Your goal is to make the user feel fully prepared and confident going into their meeting.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['web-researcher', 'calendar-finder'],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
        'web-researcher': {
          id: 'web-researcher',
          name: 'Web Researcher',
          description: 'Conducts web research to help prepare for meetings',
          prompt:
            'You are a research specialist that helps prepare for meetings. When given meeting details and context, conduct thorough web research to:\n' +
            '\n' +
            '1. Research attendees/companies involved (if applicable)\n' +
            '2. Find relevant background information on topics to be discussed\n' +
            '3. Identify recent news or developments related to the meeting subject\n' +
            '4. Gather key facts, statistics, or talking points that would be useful\n' +
            '\n' +
            "Present your findings in a clear, organized format that's easy to review before the meeting. Focus on actionable insights and relevant context.",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '7fn697dfkqyz0rai8g3nh',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-18T22:18:21.279Z',
      updatedAt: '2025-12-18T22:35:29.741Z',
      models: { base: { model: 'anthropic/claude-sonnet-4-5' } },
      stopWhen: { transferCountIs: 10 },
      tools: {
        '6bb1ve7v75qokhqcp7p1r': {
          id: '6bb1ve7v75qokhqcp7p1r',
          name: 'Google Calendar MCP',
          description: null,
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://logos.composio.dev/api/googlecalendar',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'qa-agent': {
      id: 'qa-agent',
      name: 'Q&A Agent',
      description: null,
      defaultSubAgentId: 'qa-sub-agent',
      subAgents: {
        'qa-sub-agent': {
          id: 'qa-sub-agent',
          name: 'Q&A sub agent',
          description: 'Responsible for search knowledge base and answering question',
          prompt:
            'You are a helpful assistant\n' +
            '\n' +
            'if you cant answer the question make a zendesk ticket',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'wlowjsep89o8muyg0k6i7',
              toolId: 'rjziaq0tono242cg91cvx',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-11-26T00:44:20.930Z',
      updatedAt: '2025-12-12T16:59:11.103Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        rjziaq0tono242cg91cvx: {
          id: 'rjziaq0tono242cg91cvx',
          name: 'Zendesk',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://zendesk-mcp-sand.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: '',
        },
      },
      functionTools: {},
    },
    'sales-agent': {
      id: 'sales-agent',
      name: 'Sales agent',
      description: null,
      defaultSubAgentId: 'sales-coordinator',
      subAgents: {
        'company-researcher': {
          id: 'company-researcher',
          name: 'Company Researcher',
          description: 'Researches company basics and relevant signals using web search',
          prompt:
            'You are a company research specialist. When given a company name:\n' +
            '\n' +
            '1. Research company basics:\n' +
            '   - What the company does (products/services)\n' +
            '   - Industry and market position\n' +
            '   - Recent news and relevant signals (funding, growth, challenges)\n' +
            '   - Company size and stage\n' +
            '\n' +
            '2. Use web search to find authoritative sources like:\n' +
            '   - Company website\n' +
            '   - Recent news articles\n' +
            '   - Industry reports\n' +
            '   - LinkedIn company page\n' +
            '\n' +
            '3. Present findings in a clear, structured format:\n' +
            '   - Brief company overview\n' +
            '   - Key products/services\n' +
            '   - Recent developments and signals\n' +
            '   - Potential pain points or opportunities\n' +
            '\n' +
            "Be factual and cite sources. Focus on information relevant to understanding the company's needs and challenges.",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '1ipqdo8f8wxklhnqz91wr',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'competitor-analyst': {
          id: 'competitor-analyst',
          name: 'Competitor Analyst',
          description: 'Identifies competitors and common gaps using web search',
          prompt:
            'You are a competitive analysis specialist. When given a company name and their business context:\n' +
            '\n' +
            '1. Identify likely competitors/alternatives:\n' +
            '   - Direct competitors in the same space\n' +
            '   - Alternative solutions customers might consider\n' +
            '   - Adjacent products or approaches\n' +
            '\n' +
            '2. Research common gaps and pain points:\n' +
            '   - Known limitations of competitors\n' +
            '   - Common customer complaints\n' +
            '   - Unmet needs in the market\n' +
            '   - Industry challenges\n' +
            '\n' +
            '3. Use web search to find:\n' +
            '   - Competitor comparison articles\n' +
            '   - Customer reviews and forums\n' +
            '   - Industry analysis\n' +
            '   - G2, Capterra, or similar review sites\n' +
            '\n' +
            '4. Present findings:\n' +
            '   - List of key competitors/alternatives\n' +
            '   - Common gaps and limitations\n' +
            '   - Customer pain points mentioned\n' +
            '   - Market opportunities\n' +
            '\n' +
            'Be objective and evidence-based. Focus on actionable insights for positioning.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '8idbgpfskdfro53t73wsl',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'inkeep-positioning': {
          id: 'inkeep-positioning',
          name: 'Inkeep Positioning Specialist',
          description: 'Retrieves Inkeep positioning and differentiators from documentation',
          prompt:
            'You are an Inkeep product specialist. Your role is to:\n' +
            '\n' +
            "1. Search Inkeep's documentation to find:\n" +
            '   - Core value propositions and positioning\n' +
            '   - Key differentiators and unique features\n' +
            '   - Use cases and customer benefits\n' +
            '   - Technical capabilities\n' +
            '\n' +
            "2. ONLY use information from Inkeep's documentation:\n" +
            '   - Never invent or assume features\n' +
            "   - If information isn't found, say so explicitly\n" +
            '   - Always cite the source of information\n' +
            '\n' +
            '3. Present findings:\n' +
            '   - What makes Inkeep unique\n' +
            '   - Key features and capabilities (verified only)\n' +
            '   - Relevant use cases\n' +
            '   - Benefits and value drivers\n' +
            '\n' +
            "4. Focus on information relevant to the company's context when provided\n" +
            '\n' +
            "Be accurate and conservative. If you can't find specific information in the docs, acknowledge the gap rather than filling it with assumptions.",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'faykfch5jdrvuc7cgz9y4',
              toolId: 'c7kdb6dt92nyb80ub2rng',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'sales-coordinator': {
          id: 'sales-coordinator',
          name: 'Sales Coordinator',
          description: 'Orchestrates the sales research workflow and synthesizes insights',
          prompt:
            'You are a sales coordinator who orchestrates company research and synthesizes insights for sales conversations.\n' +
            '\n' +
            '**Workflow:**\n' +
            '\n' +
            '1. When you receive a company name, delegate research in this order:\n' +
            '   a. First, delegate to Company Researcher to understand the company\n' +
            '   b. Then, delegate to Competitor Analyst to identify alternatives and gaps\n' +
            '   c. Finally, delegate to Inkeep Positioning Specialist to get relevant Inkeep differentiators\n' +
            '\n' +
            '2. After gathering all insights, synthesize a comprehensive sales brief:\n' +
            '   - **Company Overview**: What they do and recent signals\n' +
            '   - **Competitive Landscape**: Key alternatives and common gaps\n' +
            "   - **Inkeep Positioning**: How Inkeep's capabilities address their needs\n" +
            '   - **Talk Track Suggestions**: Specific angles to emphasize based on the research\n' +
            '\n' +
            '3. Present the synthesis in a clear, actionable format for sales conversations\n' +
            '\n' +
            '**Guidelines:**\n' +
            "- Always delegate to sub-agents; don't try to research yourself\n" +
            '- Wait for each delegation to complete before proceeding to the next\n' +
            '- Synthesize findings into a cohesive narrative\n' +
            '- Highlight specific connections between company needs, gaps, and Inkeep capabilities\n' +
            '- Be concise but comprehensive\n' +
            '\n' +
            'Your goal is to prepare a sales rep with everything they need to have an informed, relevant conversation.',
          models: { base: { model: 'openai/gpt-5.2' } },
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['company-researcher', 'inkeep-positioning', 'competitor-analyst'],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
      },
      createdAt: '2025-12-18T14:09:05.838Z',
      updatedAt: '2025-12-18T14:44:46.024Z',
      stopWhen: { transferCountIs: 10 },
      tools: {
        c7kdb6dt92nyb80ub2rng: {
          id: 'c7kdb6dt92nyb80ub2rng',
          name: 'Inkeep Enterprise Search MCP',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.inkeep.com/inkeep/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'sales-intelligence-agent': {
      id: 'sales-intelligence-agent',
      name: 'Sales Intelligence Agent',
      description: null,
      defaultSubAgentId: 'sales-brief-coordinator',
      subAgents: {
        '4cp6qs8le8zq4ppiw40a8': {
          id: '4cp6qs8le8zq4ppiw40a8',
          name: 'Notion Writer SubAgent',
          description: '',
          prompt:
            "You're job is to create and populate a notion subpage within notions page id: 2cd45f35b5ad802390defcc080b568ed",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'owessnxnhq01389y2ipb2',
              toolId: 'svclt7yv8fg0dgtku6wm2',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'company-researcher': {
          id: 'company-researcher',
          name: 'Company Researcher',
          description:
            'Researches company basics and relevant signals using web search (max 2 searches)',
          prompt:
            'You are a company research specialist. When given a company name:\n' +
            '\n' +
            '1. Use web search to research company basics:\n' +
            '   - What the company does (products/services)\n' +
            '   - Industry and market position\n' +
            '   - Company size and stage\n' +
            '   - Recent news and relevant signals (funding, growth, challenges, announcements)\n' +
            '\n' +
            '2. **CRITICAL LIMIT: You may use web search tools a MAXIMUM of 2 times total**\n' +
            '   - Plan your searches carefully\n' +
            '   - Use broad, comprehensive queries\n' +
            '   - Do NOT exceed 2 search tool calls\n' +
            '\n' +
            '3. Present findings in a clear, structured format:\n' +
            '   - Brief company overview\n' +
            '   - Key products/services\n' +
            '   - Recent developments and signals\n' +
            '   - Potential pain points or opportunities\n' +
            '\n' +
            "Be factual and cite sources. Focus on information relevant to understanding the company's needs and challenges.",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'y5jiotm88ijsa42fgl5ko',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'competitor-analyst': {
          id: 'competitor-analyst',
          name: 'Competitor Analyst',
          description:
            'Identifies competitors/alternatives and common gaps using web search (max 2 searches)',
          prompt:
            'You are a competitive analysis specialist. When given a company name and their business context:\n' +
            '\n' +
            '1. Use web search to identify:\n' +
            '   - Likely competitors in the same space\n' +
            '   - Alternative solutions customers might consider\n' +
            '   - Common gaps and pain points in the market\n' +
            '   - Known limitations of competitors\n' +
            '   - Industry challenges\n' +
            '\n' +
            '2. **CRITICAL LIMIT: You may use web search tools a MAXIMUM of 2 times total**\n' +
            '   - Plan your searches strategically\n' +
            '   - Use comprehensive queries that cover multiple aspects\n' +
            '   - Do NOT exceed 2 search tool calls\n' +
            '\n' +
            '3. Present findings:\n' +
            '   - List of key competitors/alternatives\n' +
            '   - Common gaps and limitations\n' +
            '   - Customer pain points mentioned\n' +
            '   - Market opportunities\n' +
            '\n' +
            'Be objective and evidence-based. Focus on actionable insights for positioning.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '9829l3gbh956pjurpuqbr',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'inkeep-positioning': {
          id: 'inkeep-positioning',
          name: 'Inkeep Positioning Specialist',
          description:
            'Retrieves Inkeep positioning and differentiators from documentation (max 2 searches)',
          prompt:
            'You are an Inkeep product specialist. Your role is to:\n' +
            '\n' +
            "1. Search Inkeep's documentation to find:\n" +
            '   - Core value propositions and positioning\n' +
            '   - Key differentiators and unique features\n' +
            '   - Use cases and customer benefits\n' +
            '   - Technical capabilities\n' +
            '\n' +
            '2. **CRITICAL LIMIT: You may use the Inkeep search tool a MAXIMUM of 2 times total**\n' +
            '   - Plan your searches to get comprehensive coverage\n' +
            '   - Use targeted queries\n' +
            '   - Do NOT exceed 2 search tool calls\n' +
            '\n' +
            "3. **ONLY use information from Inkeep's documentation:**\n" +
            '   - NEVER invent or assume features\n' +
            "   - If information isn't found, say so explicitly\n" +
            '   - Always cite the source of information\n' +
            '\n' +
            '4. **After gathering Inkeep positioning, read the Sales Brief Template from Notion:**\n' +
            '   - Use the Notion tool to read page ID: 2cd45f35b5ad802390defcc080b568ed\n' +
            '   - Extract the template structure (headings and sections)\n' +
            '   - Note the exact section names and order\n' +
            '\n' +
            '5. Present findings in the EXACT template structure:\n' +
            "   - Use the template's section headings verbatim\n" +
            '   - Fill each section with relevant Inkeep positioning (1-4 bullets max per section)\n' +
            '   - Do NOT add or remove sections from the template\n' +
            '   - Keep content concise and actionable\n' +
            '\n' +
            "Be accurate and conservative. If you can't find specific information in the docs, acknowledge the gap rather than filling it with assumptions.",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '1zvzsgyz4d9r40wsytrz9',
              toolId: 'c7kdb6dt92nyb80ub2rng',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
            {
              agentToolRelationId: '2xtjjb9hronyjah7amhp3',
              toolId: 'svclt7yv8fg0dgtku6wm2',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'sales-brief-coordinator': {
          id: 'sales-brief-coordinator',
          name: 'Sales Brief Coordinator',
          description:
            'Orchestrates research workflow and synthesizes insights into a comprehensive sales brief',
          prompt:
            'You are a sales intelligence coordinator who orchestrates research and synthesizes insights for sales conversations.\n' +
            '\n' +
            '**Workflow:**\n' +
            '\n' +
            '1. When you receive a company name, delegate research in this order:\n' +
            '   a. First, delegate to Company Researcher to understand the company\n' +
            '   b. Then, delegate to Competitor Analyst to identify alternatives and gaps\n' +
            '   c. Finally, delegate to Inkeep Positioning Specialist to get relevant Inkeep differentiators AND the completed sales brief using the Notion template\n' +
            '\n' +
            '2. **CRITICAL: After delegation is complete, present the FINAL OUTPUT:**\n' +
            '   - The Inkeep Positioning Specialist will return a completed sales brief following the Notion template structure\n' +
            '   - Present this completed sales brief EXACTLY as received from the specialist\n' +
            '   - Do NOT reformat, add sections, or change the structure\n' +
            "   - The brief should follow the template's exact headings and format\n" +
            '\n' +
            '3. The completed brief will be structured according to the Sales Brief Template and include:\n' +
            '   - Company overview and insights from Company Researcher\n' +
            '   - Competitive landscape from Competitor Analyst\n' +
            '   - Inkeep positioning and differentiators from documentation\n' +
            "   - All organized in the template's section structure (1-4 bullets per section)\n" +
            '\n' +
            '**Guidelines:**\n' +
            '- Always delegate to all three sub-agents in order\n' +
            '- Wait for each delegation to complete before proceeding to the next\n' +
            '- Present the final sales brief in the exact template format provided by the Inkeep Positioning Specialist\n' +
            '- Do NOT modify the template structure or section headings\n' +
            '- Ensure the brief is concise and actionable for a sales rep\n' +
            '\n' +
            "Your goal is to prepare a sales rep with a structured, template-based sales brief that's immediately actionable.",
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [
            'company-researcher',
            'inkeep-positioning',
            'competitor-analyst',
            '4cp6qs8le8zq4ppiw40a8',
          ],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
      },
      createdAt: '2025-12-19T17:21:56.099Z',
      updatedAt: '2025-12-19T17:41:48.015Z',
      models: { base: { model: 'openai/gpt-5.2' } },
      stopWhen: { transferCountIs: 10 },
      tools: {
        svclt7yv8fg0dgtku6wm2: {
          id: 'svclt7yv8fg0dgtku6wm2',
          name: 'Notion',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.notion.com/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: null,
        },
        c7kdb6dt92nyb80ub2rng: {
          id: 'c7kdb6dt92nyb80ub2rng',
          name: 'Inkeep Enterprise Search MCP',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.inkeep.com/inkeep/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'sales-meeting-prep-agent': {
      id: 'sales-meeting-prep-agent',
      name: 'Sales Meeting Prep Agent',
      description: null,
      defaultSubAgentId: 'prep-coordinator',
      subAgents: {
        'calendar-finder': {
          id: 'calendar-finder',
          name: 'Calendar Finder',
          description: 'Finds upcoming sales meetings from Google Calendar',
          prompt:
            'You are a calendar search specialist that finds upcoming sales meetings.\n' +
            '\n' +
            "Today's date is: {{CURRENT_DATE}}\n" +
            '\n' +
            'When asked to find a meeting:\n' +
            "1. Search Google Calendar for upcoming meetings based on the user's query\n" +
            '2. Focus on external meetings (look for non-company email domains)\n' +
            '3. Present meeting details including:\n' +
            '   - Date and time\n' +
            '   - Meeting title\n' +
            '   - Attendees (names and email addresses)\n' +
            '   - Meeting link\n' +
            '   - Any agenda or description\n' +
            '\n' +
            '4. Return the meeting information clearly so research can be conducted\n' +
            '\n' +
            'Be thorough and accurate in your search.',
          models: { base: { model: 'anthropic/claude-opus-4-5' } },
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: '70mqw509rummhjm20d4j7',
              toolId: '6bb1ve7v75qokhqcp7p1r',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
        'prep-coordinator': {
          id: 'prep-coordinator',
          name: 'Sales Prep Coordinator',
          description: 'Orchestrates the meeting prep workflow',
          prompt:
            'You are the main coordinator for sales meeting preparation.\n' +
            '\n' +
            "Today's date is: {{CURRENT_DATE}}\n" +
            '\n' +
            '**Your Workflow:**\n' +
            '\n' +
            '1. When a user asks to prep for a meeting, first delegate to the Calendar Finder to locate the meeting\n' +
            '2. Once you have the meeting details, delegate to the Sales Researcher to conduct comprehensive research on:\n' +
            '   - The company\n' +
            '   - The attendees\n' +
            '   - Relevant context and talking points\n' +
            '3. Synthesize all information into a comprehensive meeting prep brief\n' +
            '\n' +
            '**Your Final Brief Should Include:**\n' +
            '- Meeting details (date, time, attendees)\n' +
            '- Company background and recent news\n' +
            '- Information about key attendees\n' +
            '- Suggested talking points and questions\n' +
            '- Potential challenges or pain points to address\n' +
            '- Recommended approach for the call\n' +
            '\n' +
            '**Guidelines:**\n' +
            '- Be proactive and thorough\n' +
            '- Always delegate to specialized sub-agents\n' +
            '- Synthesize findings into actionable insights\n' +
            '- Keep the brief focused and scannable\n' +
            '- Highlight the most important information\n' +
            '\n' +
            'Your goal: Make the user feel fully prepared and confident for their sales call.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: ['sales-researcher', 'calendar-finder'],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
        },
        'sales-researcher': {
          id: 'sales-researcher',
          name: 'Sales Researcher',
          description: 'Conducts comprehensive web research for sales meeting preparation',
          prompt:
            'You are a sales research specialist that conducts thorough research for upcoming sales calls.\n' +
            '\n' +
            'When given meeting details, research:\n' +
            '\n' +
            '1. **Company Research:**\n' +
            '   - Company overview and what they do\n' +
            '   - Recent news, funding, or announcements\n' +
            '   - Company size and growth trajectory\n' +
            '   - Key products and services\n' +
            '\n' +
            '2. **Key People:**\n' +
            '   - Research attendees by name and company\n' +
            '   - Their roles and responsibilities\n' +
            '   - Recent activities or posts (if available)\n' +
            '\n' +
            '3. **Sales Intelligence:**\n' +
            '   - Potential pain points or challenges\n' +
            '   - Industry trends affecting them\n' +
            '   - Competitors they might be using\n' +
            '   - Relevant use cases\n' +
            '\n' +
            '4. **Talking Points:**\n' +
            '   - Suggest relevant discussion topics\n' +
            '   - Potential value propositions\n' +
            '   - Questions to ask\n' +
            '\n' +
            "Present your findings in a clear, structured format that's easy to review before the call.\n" +
            'Use web search to find authoritative, recent information.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'l3b60nyixu8dhh5p0rnph',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-18T22:42:45.876Z',
      updatedAt: '2025-12-19T16:00:00.954Z',
      models: { base: { model: 'openai/gpt-5.2' } },
      stopWhen: { transferCountIs: 10 },
      tools: {
        '6bb1ve7v75qokhqcp7p1r': {
          id: '6bb1ve7v75qokhqcp7p1r',
          name: 'Google Calendar MCP',
          description: null,
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://logos.composio.dev/api/googlecalendar',
        },
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
    'web-search-agent': {
      id: 'web-search-agent',
      name: 'Web search agent',
      description: null,
      defaultSubAgentId: 'web-search-subagent',
      subAgents: {
        'web-search-subagent': {
          id: 'web-search-subagent',
          name: 'Web Search Sub Agent',
          description: 'Performs web searches and returns relevant results',
          prompt:
            'You are a helpful web search assistant. When users ask questions, use the web search tools to find relevant information from the internet. Always provide clear, well-organized summaries of the search results with source links.\n' +
            '\n' +
            'For general queries, use the basic-search tool.\n' +
            'For complex or nuanced queries that need comprehensive coverage, use the deep-search tool which automatically expands queries and ranks results.',
          models: null,
          stopWhen: null,
          canTransferTo: [],
          canDelegateTo: [],
          skills: [],
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              agentToolRelationId: 'edx1gs30zh50pk4wjozd5',
              toolId: 'tdrfknro54h4b0lwklhig',
              toolSelection: null,
              headers: null,
              toolPolicies: null,
            },
          ],
        },
      },
      createdAt: '2025-12-12T20:05:35.221Z',
      updatedAt: '2025-12-12T20:06:28.613Z',
      tools: {
        tdrfknro54h4b0lwklhig: {
          id: 'tdrfknro54h4b0lwklhig',
          name: 'Web search tool',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://web-search-eight.vercel.app/mcp' },
              transport: { type: 'streamable_http' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
        },
      },
      functionTools: {},
    },
  },
  tools: {
    mkb40x7c6vz5720dp6bgx: {
      tenantId: 'default',
      id: 'mkb40x7c6vz5720dp6bgx',
      projectId: 'demo-project',
      name: 'Exa Web Search',
      description: null,
      config: {
        mcp: {
          prompt: '',
          server: {
            url: 'https://mcp.exa.ai/mcp?exaApiKey=db95d6bd-9bc3-491c-95f8-bc207a73a6b1',
          },
          transport: { type: 'streamable_http' },
          toolOverrides: {},
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: '',
      capabilities: null,
      lastError: null,
      isWorkApp: false,
      createdAt: '2026-02-13 01:41:37.521',
      updatedAt: '2026-02-13 01:41:41.485',
    },
    '6bb1ve7v75qokhqcp7p1r': {
      tenantId: 'default',
      id: '6bb1ve7v75qokhqcp7p1r',
      projectId: 'demo-project',
      name: 'Google Calendar MCP',
      description: null,
      config: {
        mcp: {
          server: {
            url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
          },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'user',
      headers: null,
      imageUrl: 'https://logos.composio.dev/api/googlecalendar',
      capabilities: null,
      lastError: null,
      isWorkApp: false,
      createdAt: '2025-12-18 22:20:28.138',
      updatedAt: '2026-02-19 18:20:11.37',
    },
    svclt7yv8fg0dgtku6wm2: {
      tenantId: 'default',
      id: 'svclt7yv8fg0dgtku6wm2',
      projectId: 'demo-project',
      name: 'Notion',
      description: null,
      config: {
        mcp: {
          server: { url: 'https://mcp.notion.com/mcp' },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'user',
      headers: null,
      imageUrl: null,
      capabilities: null,
      lastError:
        'Authentication required - OAuth login needed. Streamable HTTP error: Error POSTing to endpoint: {"error":"invalid_token","error_description":"Missing or invalid access token"}',
      isWorkApp: false,
      createdAt: '2025-12-18 12:36:41.847',
      updatedAt: '2026-02-13 01:40:55.777',
    },
    xsg3x642jcx5jmwmaenar: {
      tenantId: 'default',
      id: 'xsg3x642jcx5jmwmaenar',
      projectId: 'demo-project',
      name: 'Ashby MCP',
      description: null,
      config: {
        mcp: {
          server: {
            url: 'https://backend.composio.dev/v3/mcp/38f822ab-de43-4cf8-8870-3d490c8e2ddb',
          },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: 'https://cdn.jsdelivr.net/gh/ComposioHQ/open-logos@master/ashby.svg',
      capabilities: null,
      lastError: null,
      isWorkApp: false,
      createdAt: '2025-12-18 12:31:44.397',
      updatedAt: '2026-02-13 01:40:57.244',
    },
    wtftp4mk9hk7c1zd5rdi3: {
      tenantId: 'default',
      id: 'wtftp4mk9hk7c1zd5rdi3',
      projectId: 'demo-project',
      name: 'Supabase (Gaurav Varma)',
      description: null,
      config: {
        mcp: {
          server: { url: 'https://mcp.supabase.com/mcp' },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: 'l3e51vzt5atfwymmu4ur5',
      credentialScope: 'project',
      headers: null,
      imageUrl: null,
      capabilities: null,
      lastError:
        'Authentication required - OAuth login needed. Streamable HTTP error: Error POSTing to endpoint: {"message":"Unauthorized"}',
      isWorkApp: false,
      createdAt: '2025-12-10 19:45:42.748',
      updatedAt: '2026-02-13 01:41:01.03',
    },
    i6xrgvko43d61kwg1j0di: {
      tenantId: 'default',
      id: 'i6xrgvko43d61kwg1j0di',
      projectId: 'demo-project',
      name: 'Globalping (Justin Chavez)',
      description: null,
      config: {
        mcp: {
          server: { url: 'https://mcp.globalping.dev/mcp' },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: 'https://globalping.io/icons/favicon-32x32.png',
      capabilities: null,
      lastError:
        'Authentication required - OAuth login needed. Streamable HTTP error: Error POSTing to endpoint: {"error":"invalid_token","error_description":"Missing or invalid access token"}',
      isWorkApp: false,
      createdAt: '2025-12-10 19:16:19.711',
      updatedAt: '2026-02-13 01:40:55.826',
    },
    rjziaq0tono242cg91cvx: {
      tenantId: 'default',
      id: 'rjziaq0tono242cg91cvx',
      projectId: 'demo-project',
      name: 'Zendesk',
      description: null,
      config: {
        mcp: {
          server: { url: 'https://zendesk-mcp-sand.vercel.app/mcp' },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: '',
      capabilities: null,
      lastError:
        'Streamable HTTP error: Error POSTing to endpoint: {"error": {"code": "404", "message": "The deployment could not be found on Vercel."}}',
      isWorkApp: false,
      createdAt: '2025-12-10 18:51:33.51',
      updatedAt: '2026-02-13 01:40:56.288',
    },
    c7kdb6dt92nyb80ub2rng: {
      tenantId: 'default',
      id: 'c7kdb6dt92nyb80ub2rng',
      projectId: 'demo-project',
      name: 'Inkeep Enterprise Search MCP',
      description: null,
      config: {
        mcp: {
          server: { url: 'https://mcp.inkeep.com/inkeep/mcp' },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/12535/12535014.png',
      capabilities: null,
      lastError: null,
      isWorkApp: false,
      createdAt: '2025-12-10 17:58:18.972',
      updatedAt: '2026-02-13 01:40:56.343',
    },
    '4cpdsk4n40c2423jmiocs': {
      tenantId: 'default',
      id: '4cpdsk4n40c2423jmiocs',
      projectId: 'demo-project',
      name: 'Gmail MCP',
      description: null,
      config: {
        mcp: {
          server: {
            url: 'https://backend.composio.dev/v3/mcp/a0ab7dab-1c66-49a2-b521-1f6fe8d95109?user_id=default%7C%7Cdemo-project',
          },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: 'https://logos.composio.dev/api/gmail',
      capabilities: null,
      lastError: null,
      isWorkApp: false,
      createdAt: '2025-12-10 17:39:43.789',
      updatedAt: '2026-02-13 01:40:57.869',
    },
    tdrfknro54h4b0lwklhig: {
      tenantId: 'default',
      id: 'tdrfknro54h4b0lwklhig',
      projectId: 'demo-project',
      name: 'Web search tool',
      description: null,
      config: {
        mcp: {
          server: { url: 'https://web-search-eight.vercel.app/mcp' },
          transport: { type: 'streamable_http' },
        },
        type: 'mcp',
      },
      credentialReferenceId: null,
      credentialScope: 'project',
      headers: null,
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/10254/10254845.png',
      capabilities: null,
      lastError:
        'Streamable HTTP error: Error POSTing to endpoint: {"error": {"code": "404", "message": "The deployment could not be found on Vercel."}}',
      isWorkApp: false,
      createdAt: '2025-11-26 00:45:50.554',
      updatedAt: '2026-02-19 18:20:09.684',
    },
  },
  functions: null,
  externalAgents: null,
  dataComponents: null,
  artifactComponents: null,
  credentialReferences: {
    p2w6mieaqrfinek5imqx4: {
      tenantId: 'default',
      id: 'p2w6mieaqrfinek5imqx4',
      projectId: 'demo-project',
      name: 'Notion',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: 'ea2431ac-1520-454e-9f05-6286b2b85f44',
        providerConfigKey: 'notion_svcl',
      },
      toolId: 'svclt7yv8fg0dgtku6wm2',
      userId: 'Nwbx5F0GxmCD1nHtRcBRKpeW2w0dywbf',
      createdBy: 'heegun@inkeep.com',
      createdAt: '2025-12-18 22:17:29.255',
      updatedAt: '2025-12-18 22:17:29.255',
    },
    '8samfrliooeknlbf7gn9z': {
      tenantId: 'default',
      id: '8samfrliooeknlbf7gn9z',
      projectId: 'demo-project',
      name: 'Notion',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: '82f3e9a3-8b5a-4cfe-978e-14252f633723',
        providerConfigKey: 'notion_svcl',
      },
      toolId: 'svclt7yv8fg0dgtku6wm2',
      userId: '64SzZGDIo8poIeI0BJOPFAdNfG9OFRn7',
      createdBy: 'matt@inkeep.com',
      createdAt: '2025-12-18 22:17:15.684',
      updatedAt: '2025-12-18 22:17:15.684',
    },
    wve281sig4881brnyn63c: {
      tenantId: 'default',
      id: 'wve281sig4881brnyn63c',
      projectId: 'demo-project',
      name: 'Notion',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: '858da7fa-52ea-4ab3-8046-80de655789f0',
        providerConfigKey: 'notion_svcl',
      },
      toolId: 'svclt7yv8fg0dgtku6wm2',
      userId: 'jdDroHFmaXZtD5kz8pGpGiRKYR5TsSFF',
      createdBy: 'bryan@inkeep.com',
      createdAt: '2025-12-18 12:37:02.254',
      updatedAt: '2025-12-18 12:37:02.254',
    },
    rq6z45owo49eux0v8ms63: {
      tenantId: 'default',
      id: 'rq6z45owo49eux0v8ms63',
      projectId: 'demo-project',
      name: 'Notion',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: '31d32d69-cbb1-48ac-8796-00eb02e850d1',
        providerConfigKey: 'notion_noti',
      },
      toolId: null,
      userId: null,
      createdBy: 'bryan@inkeep.com',
      createdAt: '2025-12-17 23:35:32.533',
      updatedAt: '2025-12-17 23:35:32.533',
    },
    l3e51vzt5atfwymmu4ur5: {
      tenantId: 'default',
      id: 'l3e51vzt5atfwymmu4ur5',
      projectId: 'demo-project',
      name: 'Supabase (Gaurav Varma)',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: 'e82678af-c1e3-4415-b0a7-96db77816450',
        providerConfigKey: 'supabase-gaurav-varma_wtft',
      },
      toolId: null,
      userId: null,
      createdBy: null,
      createdAt: '2025-12-10 19:46:02.603',
      updatedAt: '2025-12-10 19:46:02.603',
    },
    wof2nm307suqtj909z36n: {
      tenantId: 'default',
      id: 'wof2nm307suqtj909z36n',
      projectId: 'demo-project',
      name: 'Neon',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: 'b65b99f7-5ccc-429f-be4d-b1137438bed6',
        providerConfigKey: 'neon_tpr0',
      },
      toolId: null,
      userId: null,
      createdBy: null,
      createdAt: '2025-12-09 02:42:49.456',
      updatedAt: '2025-12-09 02:42:49.456',
    },
    ajkw9zmio8zj7jl423hv2: {
      tenantId: 'default',
      id: 'ajkw9zmio8zj7jl423hv2',
      projectId: 'demo-project',
      name: 'Notion OAuth Credential',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        authMode: 'OAUTH2',
        provider: 'mcp-generic',
        connectionId: '78bb863e-9f29-4778-98e7-23060a2cd5f8',
        providerConfigKey: 'notion_34nuouvv6heqtzhagmnns',
      },
      toolId: null,
      userId: null,
      createdBy: null,
      createdAt: '2025-11-26 00:56:58.07',
      updatedAt: '2025-11-26 00:56:58.07',
    },
  },
  statusUpdates: null,
  functionTools: null,
  createdAt: '2025-11-26 00:40:07.221',
  updatedAt: '2025-11-26 00:40:07.221',
};
