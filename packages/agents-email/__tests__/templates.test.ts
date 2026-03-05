import { render } from '@react-email/render';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { InvitationEmail } from '../src/templates/invitation.js';
import { PasswordResetEmail } from '../src/templates/password-reset.js';

describe('InvitationEmail', () => {
  const baseData = {
    to: 'user@example.com',
    inviterName: 'Alice',
    organizationName: 'Acme Corp',
    role: 'Admin',
    invitationUrl: 'https://app.example.com/accept-invitation/123?email=user@example.com',
  };

  it('renders with org name, inviter, role, and CTA URL', async () => {
    const html = await render(React.createElement(InvitationEmail, { data: baseData }));
    expect(html).toContain('Alice');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('Admin');
    expect(html).toContain('https://app.example.com/accept-invitation/123');
    expect(html).toContain('Accept Invitation');
  });

  it('renders "Sign in with Google" CTA for google auth method', async () => {
    const html = await render(
      React.createElement(InvitationEmail, {
        data: { ...baseData, authMethod: 'google' },
      })
    );
    expect(html).toContain('Sign in with Google');
    expect(html).not.toContain('Accept Invitation');
  });

  it('renders "Sign in with SSO" CTA for sso auth method', async () => {
    const html = await render(
      React.createElement(InvitationEmail, {
        data: { ...baseData, authMethod: 'sso' },
      })
    );
    expect(html).toContain('Sign in with SSO');
  });

  it('renders "Accept Invitation" CTA for email-password auth method', async () => {
    const html = await render(
      React.createElement(InvitationEmail, {
        data: { ...baseData, authMethod: 'email-password' },
      })
    );
    expect(html).toContain('Accept Invitation');
  });

  it('includes expiry notice', async () => {
    const html = await render(React.createElement(InvitationEmail, { data: baseData }));
    expect(html).toContain('expires in');
    expect(html).toContain('days');
  });

  it('includes Inkeep logo', async () => {
    const html = await render(React.createElement(InvitationEmail, { data: baseData }));
    expect(html).toContain('inkeep.com');
  });

  it('includes preview text', async () => {
    const html = await render(React.createElement(InvitationEmail, { data: baseData }));
    expect(html).toContain('Accept your invitation to join Acme Corp as Admin');
  });
});

describe('PasswordResetEmail', () => {
  const baseData = {
    to: 'user@example.com',
    resetUrl: 'https://app.example.com/reset-password?token=abc123',
  };

  it('renders with reset URL and CTA', async () => {
    const html = await render(React.createElement(PasswordResetEmail, { data: baseData }));
    expect(html).toContain('https://app.example.com/reset-password?token=abc123');
    expect(html).toContain('Reset Password');
  });

  it('includes expiry notice', async () => {
    const html = await render(React.createElement(PasswordResetEmail, { data: baseData }));
    expect(html).toContain('30 minutes');
  });

  it('includes security text', async () => {
    const html = await render(React.createElement(PasswordResetEmail, { data: baseData }));
    expect(html).toContain('request this');
  });

  it('includes Inkeep logo', async () => {
    const html = await render(React.createElement(PasswordResetEmail, { data: baseData }));
    expect(html).toContain('inkeep.com');
  });

  it('includes preview text with expiry', async () => {
    const html = await render(React.createElement(PasswordResetEmail, { data: baseData }));
    expect(html).toContain('expires in 30 minutes');
  });

  it('supports custom expiry time', async () => {
    const html = await render(
      React.createElement(PasswordResetEmail, {
        data: { ...baseData, expiresInMinutes: 60 },
      })
    );
    expect(html).toContain('60 minutes');
  });
});
