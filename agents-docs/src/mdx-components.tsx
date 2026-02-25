/** biome-ignore-all lint/performance/noImgElement: n/a */

import {
  Accordion,
  Accordions,
  a,
  CodeGroup,
  Frame,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  Note,
  pre,
  Step,
  Steps,
  Tab,
  Tabs,
  Tip,
  Video,
  Warning,
} from '@inkeep/docskit/mdx';
import { createAPIPage } from 'fumadocs-openapi/ui';
import { createGenerator } from 'fumadocs-typescript';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import NextImage from 'next/image';
import { ComparisonTable } from '@/components/comparisons-table';
import { AutoTypeTable, type TypeLinksInput } from '@/components/mdx/auto-type-table';
import { BigVideo } from '@/components/mdx/big-video';
import { Card } from '@/components/mdx/card';
import { OptionCard, OptionCards } from '@/components/mdx/option-cards';
import { SkillRule } from '@/components/mdx/skill-rule';
import { openapi } from '@/lib/openapi';

// Snippet component for MDX snippets
// This is a placeholder that should be replaced by remark-mdx-snippets plugin
function Snippet({ file }: { file: string }) {
  return <div>Snippet: {file}</div>;
}

const generator = createGenerator();
const APIPage = createAPIPage(openapi);

const defaultTypeLinks: TypeLinksInput = [
  'InkeepBaseSettings',
  'ColorModeConfig',
  'UserProperties',
  'InkeepAIChatSettings',
  'AIChatFunctions',
  'AIChatDisclaimerSettings',
  'GetHelpOption',
  'CustomMessageAction',
  'AIChatToolbarButtonLabels',
  'SearchAndChatFilters',
  'ComponentsConfig',
  'OpenSettingsChatButton',
  'OpenSettingsSidebar',
  'OpenSettingsModal',
  'NestedInkeepConfig',
  'ApiConfig',
];

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    APIPage,
    AutoTypeTable: (props) => (
      <AutoTypeTable defaultTypeLinks={defaultTypeLinks} {...props} generator={generator} />
    ),
    Image: (props) => (
      <ImageZoom
        alt={props.alt ?? 'Image'}
        {...props}
        height={props.height ?? 1200}
        width={props.width ?? 1200}
        sizes="100vw"
        style={{ ...props.style, borderRadius: '10px', width: '100%' }}
      />
    ),
    ...components,
    img(props) {
      const ComponentToUse = typeof props.src === 'object' ? NextImage : 'img';
      const img = (
        <ComponentToUse {...props} className="rounded-lg border border-border w-auto mx-auto" />
      );
      if (!props.alt) {
        return img;
      }
      return (
        <figure>
          {img}
          <figcaption className="mt-2 text-center text-sm">{props.alt}</figcaption>
        </figure>
      );
    },
    Accordions,
    Accordion,
    BigVideo,
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
    Snippet,
    ComparisonTable,
    OptionCard,
    OptionCards,
    SkillRule,
  };
}
