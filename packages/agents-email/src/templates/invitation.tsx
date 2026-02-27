import { Section, Text } from '@react-email/components';
import { EmailButton } from '../components/email-button.js';
import { EmailLayout } from '../components/email-layout.js';
import type { InvitationEmailData } from '../types.js';

function getCtaText(authMethod?: string): string {
  switch (authMethod) {
    case 'google':
      return 'Sign in with Google';
    case 'sso':
      return 'Sign in with SSO';
    default:
      return 'Accept Invitation';
  }
}

function getInstructions(authMethod?: string): string {
  switch (authMethod) {
    case 'google':
      return 'Sign in with your Google account to get started.';
    case 'sso':
      return "Sign in with your organization's SSO to get started.";
    default:
      return 'Click the button below to accept the invitation and set up your account.';
  }
}

interface InvitationEmailProps {
  data: InvitationEmailData;
}

export function InvitationEmail({ data }: InvitationEmailProps) {
  const {
    inviterName,
    organizationName,
    role,
    invitationUrl,
    authMethod,
    expiresInDays = 7,
  } = data;

  return (
    <EmailLayout
      previewText={`Accept your invitation to join ${organizationName} as ${role}.`}
      securityText="If you didn't expect this invitation, you can safely ignore this email."
    >
      <Section>
        <Text className="text-email-text text-[16px] leading-[24px] mt-0">
          {inviterName} invited you to join <strong>{organizationName}</strong> as{' '}
          <strong>{role}</strong>.
        </Text>
        <Text className="text-email-text-secondary text-[14px] leading-[20px]">
          {getInstructions(authMethod)}
        </Text>
      </Section>
      <Section className="text-center my-[24px]">
        <EmailButton href={invitationUrl}>{getCtaText(authMethod)}</EmailButton>
      </Section>
      <Section>
        <Text className="text-email-text-muted text-[12px] leading-[16px]">
          This invitation expires in {expiresInDays} days.
        </Text>
      </Section>
    </EmailLayout>
  );
}
