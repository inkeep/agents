import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createEmailService } from '../src/index.js';
import { sendEmail } from '../src/send.js';
import { InvitationEmail } from '../src/templates/invitation.js';
import { PasswordResetEmail } from '../src/templates/password-reset.js';

describe('createEmailService', () => {
  it('returns not configured when no SMTP env vars are set', () => {
    const service = createEmailService({ env: {} });
    expect(service.isConfigured).toBe(false);
  });

  it('returns configured when SMTP_HOST and SMTP_FROM_ADDRESS are set', () => {
    const service = createEmailService({
      env: {
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_FROM_ADDRESS: 'test@example.com',
      },
    });
    expect(service.isConfigured).toBe(true);
  });

  it('sendInvitationEmail returns emailSent:false when not configured', async () => {
    const service = createEmailService({ env: {} });
    const result = await service.sendInvitationEmail({
      to: 'user@example.com',
      inviterName: 'Alice',
      organizationName: 'Acme',
      role: 'Admin',
      invitationUrl: 'https://example.com/invite',
    });
    expect(result.emailSent).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('sendPasswordResetEmail returns emailSent:false when not configured', async () => {
    const service = createEmailService({ env: {} });
    const result = await service.sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'https://example.com/reset',
    });
    expect(result.emailSent).toBe(false);
    expect(result.error).toBeUndefined();
  });
});

describe('sendEmail', () => {
  it('calls transporter.sendMail with correct params and returns success', async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
    const mockTransporter = { sendMail: sendMailMock } as never;

    const result = await sendEmail({
      transporter: mockTransporter,
      from: 'Test <noreply@example.com>',
      replyTo: 'support@example.com',
      to: 'user@example.com',
      subject: 'Alice invited you to Acme',
      react: createElement(InvitationEmail, {
        data: {
          to: 'user@example.com',
          inviterName: 'Alice',
          organizationName: 'Acme',
          role: 'Admin',
          invitationUrl: 'https://example.com/invite',
        },
      }),
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Test <noreply@example.com>',
        replyTo: 'support@example.com',
        to: 'user@example.com',
        subject: 'Alice invited you to Acme',
        html: expect.stringContaining('Alice'),
      })
    );
    expect(result.emailSent).toBe(true);
  });

  it('returns error when transporter.sendMail throws', async () => {
    const sendMailMock = vi.fn().mockRejectedValue(new Error('SMTP connection refused'));
    const mockTransporter = { sendMail: sendMailMock } as never;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendEmail({
      transporter: mockTransporter,
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Reset your Inkeep password',
      react: createElement(PasswordResetEmail, {
        data: {
          to: 'user@example.com',
          resetUrl: 'https://example.com/reset',
        },
      }),
    });

    expect(result.emailSent).toBe(false);
    expect(result.error).toBe('SMTP connection refused');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('uses from address as replyTo when replyTo is not provided', async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
    const mockTransporter = { sendMail: sendMailMock } as never;

    await sendEmail({
      transporter: mockTransporter,
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test',
      react: createElement(PasswordResetEmail, {
        data: { to: 'user@example.com', resetUrl: 'https://example.com/reset' },
      }),
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: 'noreply@example.com',
      })
    );
  });
});
