'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteArtifactComponentAction } from '@/lib/actions/artifact-components';

interface DeleteArtifactComponentConfirmationProps {
  artifactComponentId: string;
  artifactComponentName?: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteArtifactComponentConfirmation({
  artifactComponentId,
  artifactComponentName,
  setIsOpen,
}: DeleteArtifactComponentConfirmationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteArtifactComponentAction(tenantId, projectId, artifactComponentId);
      if (result.success) {
        setIsOpen(false);
        toast.success('Artifact component deleted.');
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DeleteConfirmation
      itemName={artifactComponentName || 'this artifact component'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
