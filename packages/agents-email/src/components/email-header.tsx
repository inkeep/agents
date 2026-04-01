import { Column, Img, Row, Section, Text } from '@react-email/components';
import { LOGO_ALT, LOGO_HEIGHT, LOGO_URL } from '../theme.js';

interface EmailHeaderProps {
  title: string;
  description?: string;
}

export function EmailHeader({ title, description }: EmailHeaderProps) {
  return (
    <Section className="py-[24px]">
      <Row>
        <Column style={{ width: 48, verticalAlign: 'middle' }}>
          <Img src={LOGO_URL} alt={LOGO_ALT} height={LOGO_HEIGHT} width={LOGO_HEIGHT} />
        </Column>
        <Column style={{ verticalAlign: 'middle', paddingLeft: 16 }}>
          <Text className="text-email-text text-[20px] leading-[24px] font-semibold m-0">
            {title}
          </Text>
          {description && (
            <Text className="text-email-text-secondary text-[14px] leading-[20px] m-0 mt-[4px]">
              {description}
            </Text>
          )}
        </Column>
      </Row>
    </Section>
  );
}
