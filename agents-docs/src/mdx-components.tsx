import {
  Accordion,
  Accordions,
  a,
  Card,
  CodeGroup,
  Frame,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  Note,
  pre as OriginalPre,
  Step,
  Steps,
  Tab,
  Tabs,
  Tip,
  Video,
  Warning,
} from '@inkeep/docskit/mdx';
import { APIPage } from 'fumadocs-openapi/ui';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { createGenerator } from 'fumadocs-typescript';
import { AutoTypeTable } from 'fumadocs-typescript/ui';

import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';
import { Mermaid } from '@/components/mdx/mermaid';
import { openapi } from '@/lib/openapi';
import { YouTubeVideo } from '@/components/youtube-video';

// Snippet component for MDX snippets
// This is a placeholder that should be replaced by remark-mdx-snippets plugin
function Snippet({ file }: { file: string }) {
  return <div>Snippet: {file}</div>;
}

// Custom pre component that handles mermaid code blocks
function pre(props: ComponentProps<typeof OriginalPre>) {
  const { children, ...rest } = props;

  // Extract text content from the code block to check if it's mermaid
  let textContent = '';
  if (typeof children === 'object' && children && 'props' in children && children.props) {
    // Handle Shiki-processed code blocks - extract text content from nested spans
    const extractTextFromNode = (node: any): string => {
      if (typeof node === 'string') {
        return node;
      }
      if (Array.isArray(node)) {
        return node.map(extractTextFromNode).join('');
      }
      if (typeof node === 'object' && node?.props?.children) {
        return extractTextFromNode(node.props.children);
      }
      return '';
    };

    textContent = extractTextFromNode((children as any).props.children);
  }

  // Check if this is a mermaid code block by looking for mermaid syntax
  if (
    textContent.trim().startsWith('agent ') ||
    textContent.trim().startsWith('flowchart ') ||
    textContent.trim().startsWith('graph ') ||
    textContent.trim().startsWith('sequenceDiagram') ||
    textContent.trim().startsWith('classDiagram') ||
    textContent.trim().startsWith('stateDiagram') ||
    textContent.trim().startsWith('pie ') ||
    textContent.trim().includes('agent TD') ||
    textContent.trim().includes('agent LR') ||
    textContent.trim().includes('graph TD') ||
    textContent.trim().includes('graph LR')
  ) {
    return <Mermaid chart={textContent.trim()} />;
  }

  // For non-mermaid code blocks, use the original pre component
  return <OriginalPre {...rest}>{children}</OriginalPre>;
}

const generator = createGenerator();

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    APIPage: (props) => <APIPage {...openapi.getAPIPageProps(props)} />,
    AutoTypeTable: (props) => <AutoTypeTable {...props} generator={generator} />,
    ...components,
    Accordions,
    Accordion,
    Note,
    Warning,
    Tip,
    Card,
    pre,
    CodeGroup,
    Frame,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    a,
    Steps,
    Step,
    Tabs,
    Tab,
    Video,
    Mermaid,
    Snippet,
    YouTubeVideo,
  };
}
