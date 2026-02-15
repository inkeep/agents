import { Img, Section } from '@react-email/components';
import { LOGO_ALT, LOGO_HEIGHT, LOGO_URL } from '../theme.js';

export function EmailHeader() {
  return (
    <Section className="text-center py-[24px]">
      <Img src={LOGO_URL} alt={LOGO_ALT} height={LOGO_HEIGHT} className="mx-auto" />
    </Section>
  );
}
