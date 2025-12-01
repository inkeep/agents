import { a } from '@inkeep/docskit';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { Markdown } from '@/components/markdown';
import { createMetadata } from '@/lib/metadata';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

import { PageControls } from './page-controls';

export default async function Page(props: PageProps<'/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const MDXContent = page.data.body;
  const tocEnabled = page.data.toc.length > 0;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{
        style: 'clerk',
        enabled: tocEnabled,
      }}
      container={{
        style: tocEnabled ? undefined : { '--fd-toc-width': 0 },
      }}
    >
      <div className="flex items-center justify-between">
        <DocsTitle className="tracking-tight">{page.data.title}</DocsTitle>
        <PageControls
          title={page.data.title}
          description={page.data.description ?? ''}
          data={page.data.structuredData}
        />
      </div>
      {page.data.description && (
        <div>
          <Markdown
            text={page.data.description}
            components={{
              p: (props) => <p {...props} className="text-lg text-fd-muted-foreground" />,
            }}
          />
        </div>
      )}
      <DocsBody className="prose-gray dark:prose-invert mt-4">
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page, a),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) notFound();

  return createMetadata({
    title: `${page.data.title} - Inkeep Open Source Docs`,
    description: page.data.description,
    openGraph: {
      url: page.url,
      images: [
        {
          url: `/api/docs-og/${params.slug?.join('/')}/image.png`,
          width: 1200,
          height: 630,
        },
      ],
    },
    keywords: page.data.keywords,
  });
}
