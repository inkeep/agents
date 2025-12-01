import { source } from '@/lib/source';
import { DocsLayout, type LinkItemType } from 'fumadocs-ui/layouts/docs';
import { SLACK_URL } from '@/lib/constants';
import { FaXTwitter, FaYoutube, FaLinkedinIn, FaSlack, FaGithub } from 'react-icons/fa6';
import { Logo } from '@/components/logo';

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
      links={linkItems}
    >
      {children}
    </DocsLayout>
  );
}
