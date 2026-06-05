'use client';

import { SUPPORT_COPILOT_PLATFORMS } from '@inkeep/agents-core/client-exports';
import { type Control, type FieldValues, type Path, useWatch } from 'react-hook-form';
import { GenericComboBox } from '@/components/form/generic-combo-box';
import { GenericSelect, type SelectOption } from '@/components/form/generic-select';
import { SUPPORT_COPILOT_PLATFORM_OPTIONS } from './validation';

interface SupportCopilotConfigSectionProps<T extends FieldValues> {
  control: Control<T>;
  credentialOptions: SelectOption[];
}

const platformOptions: SelectOption[] = SUPPORT_COPILOT_PLATFORM_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

export function SupportCopilotConfigSection<T extends FieldValues>({
  control,
  credentialOptions,
}: SupportCopilotConfigSectionProps<T>) {
  const platform = useWatch({
    control,
    name: 'supportCopilotPlatform' as Path<T>,
  }) as string | undefined;

  const credentialRequired = platform
    ? (SUPPORT_COPILOT_PLATFORMS.find((p) => p.slug === platform)?.credentialRequired ?? false)
    : true;

  const credentialDescription = credentialRequired
    ? 'Grant this app access to the stored credential for the selected platform.'
    : 'Optional. Grant this app access to a stored credential.';

  return (
    <div className="space-y-4">
      <GenericSelect
        control={control}
        name={'supportCopilotPlatform' as never}
        label="Platform"
        placeholder="Select a platform"
        options={platformOptions}
        isRequired
        description="The support platform this app integrates with."
      />
      <GenericComboBox
        control={control}
        name={'supportCopilotCredentialReferenceId' as never}
        label="Credential"
        options={credentialOptions}
        placeholder="Select a credential"
        searchPlaceholder="Search credentials..."
        clearable={!credentialRequired}
        isRequired={credentialRequired}
        description={credentialDescription}
      />
    </div>
  );
}
