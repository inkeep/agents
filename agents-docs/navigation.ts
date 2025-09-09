export default {
  docs: [
    { pages: ['overview', 'quick-start', 'oss-enterprise-comparison'] },
    {
      group: 'Typescript SDK',
      pages: [
        'typescript-sdk/agent-configuration',
        'typescript-sdk/agent-relationships',
        'typescript-sdk/external-agent-configuration',
        'typescript-sdk/tools-and-mcp-servers',
        'typescript-sdk/credentials',
        'typescript-sdk/data-components',
        'typescript-sdk/context-fetchers',
        'typescript-sdk/artifact-components',
        'typescript-sdk/status-updates',
        'typescript-sdk/cli-reference',
        'authentication',
        {
          group: 'Observability',
          pages: [
            'typescript-sdk/spans',
            'typescript-sdk/signoz-usage',
            'typescript-sdk/langfuse-usage',
          ],
        },
      ],
    },
    {
      group: 'Visual Builder',
      pages: [
        'visual-builder/graphs',
        'visual-builder/mcp-servers',
        'visual-builder/credentials',
        'visual-builder/data-components',
        'visual-builder/artifact-components',
        'visual-builder/status-components',
        'visual-builder/traces',
        'visual-builder/project-management',
      ],
    },
    {
      group: 'Talk to your agents',
      pages: [
        'talk-to-your-agents/overview',
        'talk-to-your-agents/authentication',
        'talk-to-your-agents/mcp-server',
        {
          group: 'React UI Components',
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
      pages: ['api-reference/authentication', 'api-reference'],
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
      group: 'Community',
      pages: [
        'community/inkeep-community',
        'community/license',
        {
          group: 'Contributing',
          pages: ['community/contributing/overview', 'community/contributing/project-constraints'],
        },
      ],
    },
  ],
};
