'use client';

import { useRouter } from 'next/navigation';
import { NewRunConfigButton } from './new-run-config-button';

interface NewRunConfigButtonWithRefreshProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  onRunConfigCreated?: () => void;
}

export function NewRunConfigButtonWithRefresh({
  tenantId,
  projectId,
  datasetId,
  onRunConfigCreated,
}: NewRunConfigButtonWithRefreshProps) {
  const router = useRouter();

  const handleSuccess = () => {
    router.refresh();
    onRunConfigCreated?.();
  };

  return (
    <NewRunConfigButton
      tenantId={tenantId}
      projectId={projectId}
      datasetId={datasetId}
      onSuccess={handleSuccess}
    />
  );
}
