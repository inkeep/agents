import { Youtube } from '@/components/brand-icons';
import { List } from '@/components/sidebar/list';
import { Sidebar, SidebarFooter } from '@/components/ui/sidebar';
import { SLACK_URL } from '@/lib/constants';
import { docsGroups } from '@/lib/source';
import { Fade } from '../fade';
import { FooterLink } from './footer-link';

const footerLinks = [
  {
    href: 'https://github.com/inkeep/agents',
    iconName: 'LuGithub',
    label: 'GitHub',
  },
  {
    href: SLACK_URL,
    iconName: 'LuSlack',
    label: 'Slack',
  },
  {
    href: 'https://www.linkedin.com/company/inkeep/',
    iconName: 'LuLinkedin',
    label: 'LinkedIn',
  },
  {
    href: 'https://twitter.com/inkeep',
    iconName: 'FaXTwitter',
    label: 'X (Twitter)',
  },
  {
    href: 'https://www.youtube.com/@inkeep-ai',
    icon: <Youtube />,
    label: 'Inkeep on YouTube',
  },
];

export function AppSidebar() {
  return (
    <Sidebar
      className="fixed top-[calc(var(--fd-banner-height)_+_var(--fd-nav-height))] h-[--fd-sidebar-height)] border-gray-100 dark:border-gray-800 "
      style={{
        '--fd-sidebar-height': 'calc(100dvh - var(--fd-banner-height) - var(--fd-nav-height))',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--scrollbar-thumb-color) transparent',
      }}
    >
      <List groups={docsGroups} />
      <SidebarFooter className="relative bg-[hsl(var(--sidebar-background))] lg:bg-background">
        <div className="flex items-center justify-center space-x-2 px-2">
          {footerLinks.map((link) => (
            <FooterLink key={link.href} {...link} />
          ))}
        </div>
        <Fade className="-top-1/2 rotate-180 z-0 border-l border-gray-100 dark:border-gray-800 bg-gradient-to-b from-[hsl(var(--sidebar-background))] lg:from-[hsl(var(--background))] dark:from-[hsl(var(--sidebar-background))] lg:dark:from-[hsl(var(--background))]" />
      </SidebarFooter>
    </Sidebar>
  );
}
