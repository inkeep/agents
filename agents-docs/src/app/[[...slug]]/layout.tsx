import { source } from '@/lib/source';
import { DocsLayout, type LinkItemType } from 'fumadocs-ui/layouts/docs';
import { SLACK_URL } from '@/lib/constants';
import { Youtube } from '@/components/brand-icons';
import { Icon } from './_icon';
import { GithubIcon, LinkedinIcon, SlackIcon } from 'lucide-react';
import { Logo } from '@/components/logo';

const linkItems: LinkItemType[] = [
  {
    type: 'icon',
    url: 'https://github.com/inkeep/agents',
    icon: <GithubIcon />,
    text: 'GitHub',
  },
  {
    type: 'icon',
    url: SLACK_URL,
    icon: <SlackIcon />,
    text: 'Slack',
  },
  {
    type: 'icon',
    url: 'https://linkedin.com/company/inkeep/',
    icon: <LinkedinIcon />,
    text: 'LinkedIn',
  },
  {
    type: 'icon',
    url: 'https://twitter.com/inkeep',
    icon: <Icon iconName="FaXTwitter" />,
    text: 'X (Twitter)',
  },
  {
    type: 'icon',
    url: 'https://youtube.com/@inkeep-ai',
    icon: <Youtube />,
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
      links={linkItems}
    >
      {children}
    </DocsLayout>
  );
}
