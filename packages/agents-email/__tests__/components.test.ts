import { render } from '@react-email/render';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { EmailButton } from '../src/components/email-button.js';
import { EmailFooter } from '../src/components/email-footer.js';
import { EmailHeader } from '../src/components/email-header.js';
import { EmailLayout } from '../src/components/email-layout.js';

describe('EmailHeader', () => {
  it('renders Inkeep logo', async () => {
    const html = await render(React.createElement(EmailHeader));
    expect(html).toContain('inkeep.com');
    expect(html).toContain('Inkeep');
  });
});

describe('EmailFooter', () => {
  it('renders company info and security text', async () => {
    const html = await render(
      React.createElement(EmailFooter, {
        securityText: 'If you did not expect this, ignore it.',
      })
    );
    expect(html).toContain('Inkeep, Inc.');
    expect(html).toContain('San Francisco, CA');
    expect(html).toContain('If you did not expect this, ignore it.');
  });
});

describe('EmailButton', () => {
  it('renders CTA button with fallback URL', async () => {
    const html = await render(
      React.createElement(
        EmailButton,
        {
          href: 'https://example.com/action',
        },
        'Click Me'
      )
    );
    expect(html).toContain('Click Me');
    expect(html).toContain('https://example.com/action');
  });
});

describe('EmailLayout', () => {
  it('renders full email structure with preview text and children', async () => {
    const html = await render(
      React.createElement(
        EmailLayout,
        {
          previewText: 'Preview text here',
          securityText: 'Security notice',
        },
        React.createElement('p', null, 'Email body content')
      )
    );
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('<html');
    expect(html).toContain('lang="en"');
    expect(html).toContain('Preview text here');
    expect(html).toContain('Email body content');
    expect(html).toContain('Security notice');
    expect(html).toContain('Inkeep, Inc.');
  });
});
