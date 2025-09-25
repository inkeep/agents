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
import type { MDXComponents } from 'mdx/types';
import { openapi } from '@/lib/openapi';
import { Mermaid } from '@/components/mdx/mermaid';
import { type ComponentProps } from 'react';

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

    textContent = extractTextFromNode(children.props.children);
  }

  // Check if this is a mermaid code block by looking for mermaid syntax
  if (textContent.trim().startsWith('graph ') ||
      textContent.trim().startsWith('flowchart ') ||
      textContent.trim().startsWith('sequenceDiagram') ||
      textContent.trim().startsWith('classDiagram') ||
      textContent.trim().startsWith('stateDiagram') ||
      textContent.trim().startsWith('pie ') ||
      textContent.trim().includes('graph TD') ||
      textContent.trim().includes('graph LR')) {
    return <Mermaid chart={textContent.trim()} />;
  }

  // For non-mermaid code blocks, use the original pre component
  return <OriginalPre {...rest}>{children}</OriginalPre>;
}

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    APIPage: (props) => <APIPage {...openapi.getAPIPageProps(props)} />,
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
  };
}
