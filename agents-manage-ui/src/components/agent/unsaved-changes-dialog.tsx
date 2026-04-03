import { useRouter } from 'next/navigation';
import { type FC, useEffect, useRef, useState } from 'react';
import { type Control, useFormState } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type PendingNavigation = () => void;

interface UnsavedChangesDialogProps {
  dirty?: boolean;
  onSubmit: () => Promise<void>;
  control: Control<any>;
}

export const UnsavedChangesDialog: FC<UnsavedChangesDialogProps> = ({
  dirty,
  onSubmit,
  control,
}) => {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const { isDirty: rhfDirtyState, isSubmitting, isValid } = useFormState({ control });
  const isDirty = dirty || rhfDirtyState;

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
    if (!isDirty) {
      return;
    }
    function requestNavigationConfirmation(navigate: PendingNavigation) {
      pendingNavigationRef.current = navigate;
      setShowUnsavedDialog(true);
    }
    function handleDocumentClick(event: MouseEvent) {
      if (!isDirty || isNavigatingRef.current) {
        return;
      }
      const target = event.target;
      if (!(target && target instanceof HTMLElement)) {
        return;
      }
      const el = target.closest<HTMLAnchorElement>('a[href]');
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
          // To avoid race conditions since we update query params of nodeId
          setTimeout(() => {
            router.push(`${url.pathname}${url.search}${url.hash}`);
          }, 0);
        } else {
          location.href = url.href;
        }
      });
    }

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [isDirty, router]);

  useEffect(() => {
    if (!isDirty) {
      requestAnimationFrame(handleGoBack);
      return;
    }
    // Catches browser closing window
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isNavigatingRef.current) {
        return;
      }
      event.preventDefault();
      setShowUnsavedDialog(true);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    isDirty,
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
          <DialogTitle>Do you want to save the changes you made?</DialogTitle>
          <DialogDescription>Your changes will be lost if you don't save them.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={handleGoBack} className="sm:mr-auto">
            Cancel
          </Button>
          <Button variant="secondary" onClick={proceedWithNavigation} className="max-sm:order-1">
            Discard
          </Button>
          <Button onClick={handleSaveAndLeave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
