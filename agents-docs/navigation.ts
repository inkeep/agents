export default {
  docs: [
    {
      pages: [
        'overview',
        {
          group: 'Get Started',
          icon: 'LuZap',
          pages: ['quick-start/start-development', 'quick-start/traces', 'quick-start/credentials'],
        },
        'concepts',
        'troubleshooting',
      ],
    },

    {
      group: 'Typescript SDK',
      icon: 'LuCode',
      pages: [
        'typescript-sdk/agent-settings',
        'typescript-sdk/agent-relationships',
        'typescript-sdk/data-operations',
        'typescript-sdk/tools-and-mcp-servers',
        'typescript-sdk/create-mcp-servers',
        'typescript-sdk/function-tools',
        'typescript-sdk/credentials',
        'typescript-sdk/headers',
        'typescript-sdk/context-fetchers',
        'authentication',
        'typescript-sdk/data-components',
        'typescript-sdk/artifact-components',
        'typescript-sdk/status-updates',
        {
          group: 'Project Management',
          icon: 'LuFolderOpen',
          pages: [
            'typescript-sdk/project-structure',
            'typescript-sdk/configuration',
            'typescript-sdk/environments',
            'typescript-sdk/push-pull-workflows',
            'typescript-sdk/cli-reference',
          ],
        },
        {
          group: 'Observability',
          icon: 'LuChartColumn',
          pages: ['typescript-sdk/signoz-usage', 'typescript-sdk/langfuse-usage'],
        },
        'typescript-sdk/external-agents',
      ],
    },
    {
      group: 'Visual Builder',
      icon: 'LuPalette',
      pages: [
        'visual-builder/sub-agents',
        'visual-builder/mcp-servers',
        'visual-builder/function-tools',
        'visual-builder/headers',
        'visual-builder/credentials',
        'visual-builder/traces',
        'visual-builder/project-management',
        'visual-builder/data-components',
        'visual-builder/artifact-components',
        'visual-builder/status-components',
      ],
    },
    {
      group: 'Talk to your agents',
      icon: 'LuMessageSquare',
      pages: [
        'talk-to-your-agents/overview',
        'talk-to-your-agents/mcp-server',
        'talk-to-your-agents/api',
        'talk-to-your-agents/vercel-ai-sdk',
        'talk-to-your-agents/a2a',
        {
          group: 'React UI Components',
          icon: 'LuLayers',
          pages: [
            'talk-to-your-agents/react/chat-button',
            'talk-to-your-agents/react/custom-trigger',
            'talk-to-your-agents/react/side-bar-chat',
            'talk-to-your-agents/react/embedded-chat',
          ],
        },
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
        'self-hosting/docker',
        'self-hosting/add-sentry',
        'self-hosting/add-datadog-apm',
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
