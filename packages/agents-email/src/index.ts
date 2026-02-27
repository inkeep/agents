import { createElement } from 'react';
import { parseEmailEnv } from './env.js';
import { sendEmail } from './send.js';
import { InvitationEmail } from './templates/invitation.js';
import { PasswordResetEmail } from './templates/password-reset.js';
import { createTransport } from './transport.js';
import type { EmailService, InvitationEmailData, PasswordResetEmailData } from './types.js';

export type { EmailEnv } from './env.js';
export { emailEnvSchema, parseEmailEnv } from './env.js';
export { createTransport } from './transport.js';
export type {
  EmailService,
  InvitationEmailData,
  PasswordResetEmailData,
  SendResult,
} from './types.js';

export interface CreateEmailServiceOptions {
  env?: Record<string, string | undefined>;
}

export function createEmailService(options?: CreateEmailServiceOptions): EmailService {
  const emailEnv = parseEmailEnv(options?.env ?? process.env);
  const { transporter, isConfigured } = createTransport(emailEnv);

  const from = emailEnv.SMTP_FROM_NAME
    ? `${emailEnv.SMTP_FROM_NAME} <${emailEnv.SMTP_FROM_ADDRESS}>`
    : (emailEnv.SMTP_FROM_ADDRESS ?? '');
  const replyTo = emailEnv.SMTP_REPLY_TO;

  return {
    isConfigured,

    async sendInvitationEmail(data: InvitationEmailData) {
      if (!transporter) {
        return { emailSent: false };
      }
      return sendEmail({
        transporter,
        from,
        replyTo,
        to: data.to,
        subject: `${data.inviterName} invited you to ${data.organizationName}`,
        react: createElement(InvitationEmail, { data }),
      });
    },

    async sendPasswordResetEmail(data: PasswordResetEmailData) {
      if (!transporter) {
        return { emailSent: false };
      }
      return sendEmail({
        transporter,
        from,
        replyTo,
        to: data.to,
        subject: 'Reset your Inkeep password',
        react: createElement(PasswordResetEmail, { data }),
      });
    },
  };
}
