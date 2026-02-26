import { a } from '@inkeep/docskit';
import type { LoaderConfig, LoaderOutput } from 'fumadocs-core/source';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { PageJsonLd } from '@/components/seo/page-json-ld';
import { createMetadata } from '@/lib/metadata';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

import { PageControls } from './page-controls';

function formatSegmentTitle(segment: string) {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

function getBreadcrumbItems(pageUrl: string) {
  const segments = pageUrl.split('/').filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => {
    const slug = segments.slice(0, index + 1);
    const linkedPage = source.getPage(slug);

    return {
      name: linkedPage?.data.sidebarTitle ?? linkedPage?.data.title ?? formatSegmentTitle(segment),
      url: linkedPage?.url ?? `/${slug.join('/')}`,
    };
  });

  if (pageUrl !== '/overview') {
    const overviewPage = source.getPage(['overview']);
    breadcrumbs.unshift({
      name: overviewPage?.data.sidebarTitle ?? overviewPage?.data.title ?? 'Overview',
      url: overviewPage?.url ?? '/overview',
    });
  }

  const deduped = new Map<string, { name: string; url: string }>();
  for (const breadcrumb of breadcrumbs) {
    if (!deduped.has(breadcrumb.url)) {
      deduped.set(breadcrumb.url, breadcrumb);
    }
  }

  return Array.from(deduped.values());
}

export default async function Page(props: PageProps<'/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const MDXContent = page.data.body;
  const tocEnabled = page.data.toc.length > 0;
  const breadcrumbItems = getBreadcrumbItems(page.url);

  return (
    <>
      <PageJsonLd
        title={page.data.title}
        description={page.data.description}
        url={page.url}
        breadcrumbItems={breadcrumbItems}
        tocItems={page.data.toc}
        datePublished={page.data.datePublished}
        dateModified={page.data.dateModified}
      />
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
    </>
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
    alternates: {
      canonical: page.url,
      languages: {
        'en-US': page.url,
      },
    },
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
