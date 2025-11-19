'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { useCurrentRef } from '@/hooks/use-current-ref';
import { deleteArtifactComponentAction } from '@/lib/actions/artifact-components';

interface DeleteArtifactComponentConfirmationProps {
  artifactComponentId: string;
  artifactComponentName?: string;
  setIsOpen: (isOpen: boolean) => void;
  redirectOnDelete?: boolean;
}

export function DeleteArtifactComponentConfirmation({
  artifactComponentId,
  artifactComponentName,
  setIsOpen,
  redirectOnDelete = false,
}: DeleteArtifactComponentConfirmationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const ref = useCurrentRef();

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteArtifactComponentAction(
        tenantId,
        projectId,
        artifactComponentId,
        ref
      );
      if (result.success) {
        setIsOpen(false);
        toast.success('Artifact deleted.');
        if (redirectOnDelete) {
          router.push(`/${tenantId}/projects/${projectId}/artifacts`);
        }
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DeleteConfirmation
      itemName={artifactComponentName || 'this artifact'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
