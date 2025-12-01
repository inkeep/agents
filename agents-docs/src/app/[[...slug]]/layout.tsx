import { source } from '@/lib/source';
import { DocsLayout, type LinkItemType } from 'fumadocs-ui/layouts/docs';
import { SLACK_URL } from '@/lib/constants';
import { FaXTwitter, FaYoutube, FaLinkedinIn, FaSlack, FaGithub } from 'react-icons/fa6';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { GithubIcon } from '@/components/brand-icons';

const linkItems: LinkItemType[] = [
  {
    type: 'icon',
    url: 'https://github.com/inkeep/agents',
    icon: <FaGithub />,
    text: 'GitHub',
  },
  {
    type: 'icon',
    url: SLACK_URL,
    icon: <FaSlack />,
    text: 'Slack',
  },
  {
    type: 'icon',
    url: 'https://linkedin.com/company/inkeep/',
    icon: <FaLinkedinIn />,
    text: 'LinkedIn',
  },
  {
    type: 'icon',
    url: 'https://twitter.com/inkeep',
    icon: <FaXTwitter />,
    text: 'X (Twitter)',
  },
  {
    type: 'icon',
    url: 'https://youtube.com/@inkeep-ai',
    icon: <FaYoutube />,
    text: 'Inkeep on YouTube',
  },
];

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: <Logo className="!w-[110px] !h-[32px]" />,
      }}
      sidebar={{
        banner: (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-primary border border-primary/30 hover:bg-primary/5 dark:bg-primary/5 hover:text-primary dark:text-primary dark:border-primary/30 dark:hover:bg-primary/10"
              asChild
            >
              <a
                href="https://inkeep.com/cloud-waitlist?cta_id=docs_nav"
                target="_blank"
                rel="noreferrer"
              >
                Inkeep Cloud
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/inkeep/agents" target="_blank" rel="noreferrer">
                <GithubIcon />
                <span>Star</span>
              </a>
            </Button>
            <Button type="button" variant="outline" id="chat-trigger" size="sm">
              Ask AI
            </Button>
          </div>
        ),
      }}
      links={linkItems}
    >
      {children}
    </DocsLayout>
  );
}
