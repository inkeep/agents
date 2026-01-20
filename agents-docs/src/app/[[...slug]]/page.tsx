import { a } from '@inkeep/docskit';
import type { LoaderConfig, LoaderOutput } from 'fumadocs-core/source';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
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
    >
      <div className="flex items-center justify-between">
        <DocsTitle className="tracking-tight">{page.data.title}</DocsTitle>
        <PageControls
          title={page.data.title}
          description={page.data.description}
          data={page.data.structuredData}
        />
      </div>
      {page.data.description && (
        <p className="text-lg text-fd-muted-foreground mb-2">{page.data.description}</p>
      )}
      <DocsBody className="prose-gray dark:prose-invert mt-4">
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            // TODO: Remove cast when fumadocs releases fix from commit d743dc7
            a: createRelativeLink(source as unknown as LoaderOutput<LoaderConfig>, page, a),
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

  if (!page) {
    notFound();
  }

  return createMetadata({
    title: page.data.title,
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
