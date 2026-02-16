import { Body, Container, Head, Html, Preview, Tailwind } from '@react-email/components';
import type { ReactNode } from 'react';
import { emailTailwindConfig } from '../theme.js';
import { EmailFooter } from './email-footer.js';
import { EmailHeader } from './email-header.js';

interface EmailLayoutProps {
  previewText: string;
  securityText: string;
  children: ReactNode;
}

export function EmailLayout({ previewText, securityText, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Tailwind config={emailTailwindConfig}>
        <Body
          className="bg-email-bg my-0 mx-auto"
          style={{
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <Preview>{previewText}</Preview>
          <Container className="bg-email-card rounded-[8px] mx-auto my-[40px] p-[32px] max-w-[600px]">
            <EmailHeader />
            {children}
            <EmailFooter securityText={securityText} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
