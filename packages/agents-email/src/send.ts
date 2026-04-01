import { render } from '@react-email/render';
import type { Transporter } from 'nodemailer';
import type { ReactElement } from 'react';
import type { SendResult } from './types.js';

export interface SendEmailOptions {
  transporter: Transporter;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  react: ReactElement;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendResult> {
  const { transporter, from, replyTo, to, subject, react } = options;

  try {
    const html = await render(react);
    await transporter.sendMail({
      from,
      replyTo: replyTo ?? from,
      to,
      subject,
      html,
    });
    return { emailSent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send email to ${to}: ${message}`);
    return { emailSent: false, error: message };
  }
}
