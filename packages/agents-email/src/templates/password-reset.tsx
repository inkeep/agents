import { Section, Text } from '@react-email/components';
import { EmailButton } from '../components/email-button.js';
import { EmailLayout } from '../components/email-layout.js';
import type { PasswordResetEmailData } from '../types.js';

interface PasswordResetEmailProps {
  data: PasswordResetEmailData;
}

export function PasswordResetEmail({ data }: PasswordResetEmailProps) {
  const { resetUrl, expiresInMinutes = 30 } = data;

  return (
    <EmailLayout
      previewText={`This link expires in ${expiresInMinutes} minutes.`}
      securityText="If you didn't request this, you can safely ignore this email."
      title="Reset your password"
      description="We received a request to reset the password for your account."
    >
      <Section className="text-center my-[24px]">
        <EmailButton href={resetUrl}>Reset Password</EmailButton>
      </Section>
      <Section>
        <Text className="text-email-text-muted text-[12px] leading-[16px]">
          This link expires in {expiresInMinutes} minutes.
        </Text>
      </Section>
    </EmailLayout>
  );
}
