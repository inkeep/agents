import type { AuthModeType } from '@nangohq/types';

/**
 * Field configuration for credential forms
 */
export interface FieldConfig {
  /** Field key from the ApiPublicIntegrationCredentials type */
  key: string;
  /** Human-readable label */
  label: string;
  /** Input type */
  type: 'text' | 'password' | 'url' | 'textarea';
  /** Which generic component to use */
  component: 'input' | 'textarea';
  /** Placeholder text */
  placeholder: string;
  /** Help text to show below the field */
  helpText?: string;
  /** Whether this field is required */
  required: boolean;
  /** Custom validation function */
  validate?: (value: string) => string | undefined;
}

/**
 * Section configuration for grouping related fields
 */
export interface FormSection {
  /** Section title */
  title: string;
  /** Section description */
  description?: string;
  /** Fields in this section */
  fields: readonly FieldConfig[];
}

/**
 * Complete form configuration for an auth mode
 */
export interface FormConfig {
  /** Auth mode this config applies to */
  authMode: AuthModeType;
  /** Form sections */
  sections: FormSection[];
}

/**
 * URL validation helper with protocol whitelist for security
 */
const validateUrl = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    // Only allow safe protocols to prevent XSS attacks
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'Only HTTP and HTTPS URLs are allowed';
    }
    return undefined;
  } catch {
    return 'Please enter a valid URL';
  }
};

/**
 * Reusable field definitions
 */
const FIELD_DEFINITIONS = {
  client_id: {
    key: 'client_id',
    label: 'Client ID',
    type: 'text' as const,
    component: 'input' as const,
    placeholder: 'Enter your OAuth client ID',
    required: true,
  },
  client_secret: {
    key: 'client_secret',
    label: 'Client Secret',
    type: 'password' as const,
    component: 'input' as const,
    placeholder: 'Enter your OAuth client secret',
    required: true,
  },
  scopes: {
    key: 'scopes',
    label: 'Scopes',
    type: 'textarea' as const,
    component: 'textarea' as const,
    placeholder: 'Enter required scopes (space or comma separated)',
    helpText: 'Leave empty to use default scopes for this provider',
    required: false,
  },
  app_id: {
    key: 'app_id',
    label: 'App ID',
    type: 'text' as const,
    component: 'input' as const,
    placeholder: 'Enter your app ID',
    required: true,
  },
  app_link: {
    key: 'app_link',
    label: 'App Link',
    type: 'url' as const,
    component: 'input' as const,
    placeholder: 'https://example.com/app',
    helpText: 'The URL where your app is hosted or registered',
    required: true,
    validate: validateUrl,
  },
  private_key: {
    key: 'private_key',
    label: 'Private Key',
    type: 'textarea' as const,
    component: 'textarea' as const,
    placeholder: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
    helpText: "Your app's private key for authentication",
    required: true,
  },
} as const;

/**
 * Reusable section definitions
 */
const SECTION_DEFINITIONS = {
  oauth: {
    title: 'OAuth Credentials',
    description:
      "You'll need to create an OAuth application in the provider's developer console to get these credentials.",
    fields: [
      FIELD_DEFINITIONS.client_id,
      FIELD_DEFINITIONS.client_secret,
      FIELD_DEFINITIONS.scopes,
    ],
  },
  app: {
    title: 'App Credentials',
    description:
      "You'll need to create an app in the provider's developer portal to get these credentials.",
    fields: [FIELD_DEFINITIONS.app_id, FIELD_DEFINITIONS.app_link, FIELD_DEFINITIONS.private_key],
  },
  oauthMinimal: {
    title: 'OAuth Credentials',
    fields: [FIELD_DEFINITIONS.client_id, FIELD_DEFINITIONS.client_secret],
  },
  appMinimal: {
    title: 'App Credentials',
    fields: [FIELD_DEFINITIONS.app_id, FIELD_DEFINITIONS.app_link, FIELD_DEFINITIONS.private_key],
  },
} as const;

/**
 * Form configurations mapped by auth mode
 * These are derived from the ApiPublicIntegrationCredentials union type
 */
export const FORM_CONFIGS: Record<string, FormConfig> = {
  OAUTH1: {
    authMode: 'OAUTH1',
    sections: [SECTION_DEFINITIONS.oauth],
  },
  OAUTH2: {
    authMode: 'OAUTH2',
    sections: [SECTION_DEFINITIONS.oauth],
  },
  TBA: {
    authMode: 'TBA',
    sections: [
      {
        title: 'Authentication Credentials',
        description:
          "You'll need to create an application in the provider's developer console to get these credentials.",
        fields: [
          FIELD_DEFINITIONS.client_id,
          FIELD_DEFINITIONS.client_secret,
          FIELD_DEFINITIONS.scopes,
        ],
      },
    ],
  },
  APP: {
    authMode: 'APP',
    sections: [SECTION_DEFINITIONS.app],
  },
  CUSTOM: {
    authMode: 'CUSTOM',
    sections: [SECTION_DEFINITIONS.oauthMinimal, SECTION_DEFINITIONS.appMinimal],
  },
};

/**
 * Get form configuration for a given auth mode
 */
export function getFormConfig(authMode: AuthModeType): FormConfig | null {
  return FORM_CONFIGS[authMode] || null;
}

/**
 * Check if an auth mode requires a credential form
 */
export function requiresCredentialForm(authMode: AuthModeType): boolean {
  return authMode in FORM_CONFIGS;
}
