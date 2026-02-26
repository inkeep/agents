import { useRouter } from 'next/navigation';
import { type FC, useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

type PendingNavigation = () => void;

interface UnsavedChangesDialogProps {
  onSubmit: () => Promise<void>;
}

export const UnsavedChangesDialog: FC<UnsavedChangesDialogProps> = ({ onSubmit }) => {
  'use memo';
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const { control } = useFullAgentFormContext();
  const agentDirtyState = useAgentStore((state) => state.dirty);
  const { isDirty, isSubmitting, isValid } = useFormState({ control });
  const dirty = agentDirtyState || isDirty;

  const pendingNavigationRef = useRef<PendingNavigation>(null);
  const isNavigatingRef = useRef(false);
  const router = useRouter();

  function handleGoBack() {
    pendingNavigationRef.current = null;
    setShowUnsavedDialog(false);
  }

  function proceedWithNavigation() {
    const navigate = pendingNavigationRef.current;
    handleGoBack();

    if (!navigate) {
      return;
    }
    isNavigatingRef.current = true;
    navigate();
  }

  async function handleSaveAndLeave() {
    if (isSubmitting) {
      return;
    }
    await onSubmit();
    if (isValid) {
      proceedWithNavigation();
    }
    setShowUnsavedDialog(false);
  }

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const requestNavigationConfirmation = (navigate: PendingNavigation) => {
      pendingNavigationRef.current = navigate;
      setShowUnsavedDialog(true);
    };
    const handleDocumentClick = (event: MouseEvent) => {
      if (!dirty || isNavigatingRef.current) {
        return;
      }
      const el = (event.target as HTMLElement | null)?.closest(
        'a[href]'
      ) as HTMLAnchorElement | null;
      const href = el?.href;
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return;
      }
      // Don't intercept links that open in a new tab - they don't navigate away from the page, we need this for docs links.
      if (el?.target === '_blank') {
        return;
      }
      const url = new URL(href, location.href);
      event.preventDefault();
      requestNavigationConfirmation(() => {
        if (url.origin === location.origin) {
          router.push(`${url.pathname}${url.search}${url.hash}`);
        } else {
          location.href = url.href;
        }
      });
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [dirty, router]);

  useEffect(() => {
    if (!dirty) {
      requestAnimationFrame(handleGoBack);
      return;
    }
    // Catches browser closing window
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isNavigatingRef.current) {
        return;
      }
      event.preventDefault();
      setShowUnsavedDialog(true);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    dirty,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    handleGoBack,
  ]);

  return (
    <Dialog
      open={showUnsavedDialog}
      onOpenChange={(open) => {
        if (!open) {
          handleGoBack();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Are you sure you want to leave this page and discard your
            changes?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={handleGoBack} className="sm:mr-auto">
            Go back
          </Button>
          <Button variant="secondary" onClick={proceedWithNavigation} className="max-sm:order-1">
            Discard
          </Button>
          <Button onClick={handleSaveAndLeave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
