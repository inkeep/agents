import { a } from '@inkeep/docskit';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { notFound, redirect } from 'next/navigation';
import { Breadcrumb } from '@/components/breadcrumb';
import { Footer } from '@/components/footer';
import { Markdown } from '@/components/markdown';
import { createMetadata, metadataImage } from '@/lib/metadata';
import { getDocsGroupFirstChild, source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

import { PageControls } from './page-controls';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    const childPage = getDocsGroupFirstChild(params.slug?.join('/'));
    if (childPage) redirect(childPage.url);
    else notFound();
  }

  const MDXContent = page.data.body;

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{
        style: 'clerk',
        enabled: page.data.toc.length > 0,
      }}
      breadcrumb={{
        component: <Breadcrumb tree={source.pageTree} />,
      }}
      footer={{
        component: <Footer url={page.url} />,
      }}
      container={{
        className: 'lg:pt-0! [&>#nd-toc]:!pt-6 [&>#nd-toc]:pb-4 h-full min-h-0',
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
            text={page.data.description ?? ''}
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

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) notFound();

  return createMetadata(
    metadataImage.withImage(page.slugs, {
      title: `${page.data.title} - Inkeep Docs`,
      description: page.data.description,
      openGraph: {
        url: page.url,
      },
      keywords: page.data.keywords,
    })
  );
}
