import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import type { EmailEnv } from './env.js';

export interface TransportResult {
  transporter: Transporter | null;
  isConfigured: boolean;
}

export function createTransport(env: EmailEnv): TransportResult {
  if (env.RESEND_API_KEY) {
    if (!env.SMTP_FROM_ADDRESS) {
      console.warn(
        '[email] RESEND_API_KEY is set but SMTP_FROM_ADDRESS is missing. Email will be disabled.'
      );
      return { transporter: null, isConfigured: false };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: env.RESEND_API_KEY,
      },
    });

    return { transporter, isConfigured: true };
  }

  if (env.SMTP_HOST) {
    if (!env.SMTP_FROM_ADDRESS) {
      console.warn(
        '[email] SMTP_HOST is set but SMTP_FROM_ADDRESS is missing. Email will be disabled.'
      );
      return { transporter: null, isConfigured: false };
    }

    const port = env.SMTP_PORT ?? 587;
    const secure = env.SMTP_SECURE ?? port === 465;

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure,
      ...(env.SMTP_USER && env.SMTP_PASSWORD
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
        : {}),
    });

    return { transporter, isConfigured: true };
  }

  return { transporter: null, isConfigured: false };
}
