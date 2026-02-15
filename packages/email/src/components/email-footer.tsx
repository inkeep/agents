import { Hr, Section, Text } from '@react-email/components';
import { COMPANY_LOCATION, COMPANY_NAME } from '../theme.js';

interface EmailFooterProps {
  securityText: string;
}

export function EmailFooter({ securityText }: EmailFooterProps) {
  return (
    <Section>
      <Hr className="border-email-border my-[24px]" />
      <Text className="text-email-text-muted text-[12px] leading-[16px] text-center m-0">
        {COMPANY_NAME} &middot; {COMPANY_LOCATION}
      </Text>
      <Text className="text-email-text-muted text-[12px] leading-[16px] text-center mt-[8px]">
        {securityText}
      </Text>
    </Section>
  );
}
