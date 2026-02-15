export interface SendResult {
  emailSent: boolean;
  error?: string;
}

export interface InvitationEmailData {
  to: string;
  inviterName: string;
  organizationName: string;
  role: string;
  invitationUrl: string;
  authMethod?: string;
  expiresInDays?: number;
}

export interface PasswordResetEmailData {
  to: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export interface EmailService {
  sendInvitationEmail(data: InvitationEmailData): Promise<SendResult>;
  sendPasswordResetEmail(data: PasswordResetEmailData): Promise<SendResult>;
  isConfigured: boolean;
}
