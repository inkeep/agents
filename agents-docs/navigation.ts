export default {
  docs: [
    {
      pages: [
        'overview',
        {
          group: 'Get Started',
          icon: 'LuZap',
          pages: ['get-started/quick-start', 'get-started/push-pull', 'get-started/traces'],
        },
        'concepts',
        'pricing',
      ],
    },
    {
      group: 'Typescript SDK',
      icon: 'LuCode',
      pages: [
        'typescript-sdk/project-management',
        'typescript-sdk/agent-settings',
        'typescript-sdk/models',
        'typescript-sdk/agent-relationships',
        {
          group: 'Tools',
          icon: 'LuHammer',
          pages: [
            'typescript-sdk/tools/mcp-tools',
            'typescript-sdk/tools/function-tools',
            'tools/tool-approvals',
          ],
        },
        {
          group: 'Credentials',
          icon: 'LuKey',
          pages: [
            'typescript-sdk/credentials/overview',
            'typescript-sdk/credentials/nango',
            'typescript-sdk/credentials/keychain',
            'typescript-sdk/credentials/environment-variables',
            'typescript-sdk/credentials/env-aware-credentials',
          ],
        },
        'typescript-sdk/memory',
        'typescript-sdk/headers',
        'typescript-sdk/context-fetchers',
        'authentication',
        {
          group: 'Structured Outputs',
          icon: 'LuLayoutTemplate',
          pages: [
            'typescript-sdk/structured-outputs/data-components',
            'typescript-sdk/structured-outputs/artifact-components',
            'typescript-sdk/structured-outputs/status-updates',
          ],
        },
        'typescript-sdk/data-operations',
        {
          group: 'Observability',
          icon: 'LuChartColumn',
          pages: [
            'typescript-sdk/signoz-usage',
            'typescript-sdk/langfuse-usage',
            'typescript-sdk/cli-observability',
          ],
        },
        'typescript-sdk/external-agents',
        'typescript-sdk/workspace-configuration',
        'typescript-sdk/cli-reference',
      ],
    },
    {
      group: 'Visual Builder',
      icon: 'LuPalette',
      pages: [
        'visual-builder/sub-agents',
        {
          group: 'Tools and MCPs',
          icon: 'LuHammer',
          pages: [
            'visual-builder/tools/mcp-servers',
            'visual-builder/tools/credentials',
            'visual-builder/tools/function-tools',
          ],
        },
        'visual-builder/headers',
        'visual-builder/traces',
        'visual-builder/project-management',
        {
          group: 'Structured Outputs',
          icon: 'LuLayoutTemplate',
          pages: [
            'visual-builder/structured-outputs/data-components',
            'visual-builder/structured-outputs/artifact-components',
            'visual-builder/structured-outputs/status-components',
          ],
        },
      ],
    },
    {
      group: 'Talk to your agents',
      icon: 'LuMessageSquare',
      pages: [
        'talk-to-your-agents/overview',
        'talk-to-your-agents/mcp-server',
        'talk-to-your-agents/chat-api',
        {
          group: 'Chat Components',
          icon: 'LuBlocks',
          pages: [
            {
              group: 'React',
              icon: 'brand/ReactIcon',
              pages: [
                'talk-to-your-agents/react/chat-button',
                'talk-to-your-agents/react/custom-trigger',
                'talk-to-your-agents/react/side-bar-chat',
                'talk-to-your-agents/react/embedded-chat',
              ],
            },
            {
              group: 'JavaScript',
              icon: 'brand/JavascriptIcon',
              pages: [
                'talk-to-your-agents/javascript/chat-button',
                'talk-to-your-agents/javascript/custom-trigger',
                'talk-to-your-agents/javascript/side-bar-chat',
                'talk-to-your-agents/javascript/embedded-chat',
              ],
            },
            {
              group: 'Customization',
              icon: 'LuBrush',
              pages: ['ui-components/customization/styling'],
            },
          ],
        },
        {
          group: 'Vercel AI SDK',
          icon: 'LuPackage',
          pages: [
            'talk-to-your-agents/vercel-ai-sdk/use-chat',
            'talk-to-your-agents/vercel-ai-sdk/ai-elements',
          ],
        },
        'talk-to-your-agents/a2a',
        'troubleshooting',
      ],
    },
    {
      group: 'Tutorials',
      pages: [
        {
          group: 'MCP Servers',
          icon: 'LuWrench',
          pages: [
            'tutorials/mcp-servers/overview',
            'tutorials/mcp-servers/native-mcp-servers',
            'tutorials/mcp-servers/composio-mcp-servers',
            'tutorials/mcp-servers/gram',
            'tutorials/mcp-servers/custom-mcp-servers',
          ],
        },
        'tutorials/upgrading',
      ],
    },
    {
      group: 'API Reference',
      icon: 'LuBookOpen',
      pages: [
        {
          group: 'Authentication',
          icon: 'LuLock',
          pages: [
            'api-reference/authentication/run-api',
            'api-reference/authentication/manage-api',
          ],
        },
        'api-reference',
      ],
    },
    /**
     * TODO: Add back schema validation back in some way
     */
    // {
    //   group: 'UI Components',
    //   pages: ['ui-components/json-schema-validation'],
    // },
    /**
     * TODO: Add back in and flesh out Connecting your data section
     */
    // {
    //   group: 'Connecting your data',
    //   pages: [
    //     {
    //       group: '3rd Party Tools',
    //       pages: [
    //         {
    //           group: 'Data Scraping',
    //           pages: [
    //             'connecting-your-data/3rd-party-tools/exa',
    //             'connecting-your-data/3rd-party-tools/firecrawl',
    //           ],
    //         },
    //         {
    //           group: 'Data Stores',
    //           pages: [
    //             'connecting-your-data/3rd-party-tools/Pinecone',
    //             'connecting-your-data/3rd-party-tools/pgVector',
    //           ],
    //         },
    //       ],
    //     },
    //   ],
    // },
    {
      group: 'Self-Hosting',
      icon: 'LuServer',
      pages: [
        'self-hosting/vercel',
        {
          group: 'Docker',
          icon: 'brand/DockerIcon',
          pages: [
            'self-hosting/docker-local',
            'self-hosting/gcp-compute-engine',
            'self-hosting/gcp-cloud-run',
            'self-hosting/aws-ec2',
            'self-hosting/hetzner',
            'self-hosting/docker-build',
          ],
        },
        {
          group: 'Add Services',
          icon: 'LuPackage',
          pages: [
            'self-hosting/add-other-services/sentry',
            'self-hosting/add-other-services/datadog-apm',
          ],
        },
      ],
    },
    {
      group: 'Community',
      icon: 'LuUsers',
      pages: [
        'community/inkeep-community',
        'community/license',
        {
          group: 'Contributing',
          icon: 'LuGitPullRequest',
          pages: [
            'community/contributing/overview',
            'community/contributing/project-constraints',
            'community/contributing/spans',
          ],
        },
      ],
    },
  ],
};
