export const emailColors = {
  brand: '#3784ff',
  brandLight: '#D5E5FF',
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: {
    primary: '#1C1917',
    secondary: '#57534E',
    muted: '#A8A29E',
  },
  border: '#E7E5E4',
  link: '#3784ff',
} as const;

export const emailTailwindConfig = {
  theme: {
    extend: {
      colors: {
        brand: emailColors.brand,
        'brand-light': emailColors.brandLight,
        'email-bg': emailColors.background,
        'email-card': emailColors.card,
        'email-text': emailColors.text.primary,
        'email-text-secondary': emailColors.text.secondary,
        'email-text-muted': emailColors.text.muted,
        'email-border': emailColors.border,
        'email-link': emailColors.link,
      },
    },
  },
};

export const LOGO_URL = 'https://inkeep.com/icon.png';
export const LOGO_ALT = 'Inkeep';
export const LOGO_HEIGHT = 40;
export const COMPANY_NAME = 'Inkeep, Inc.';
export const COMPANY_LOCATION = 'San Francisco, CA';
