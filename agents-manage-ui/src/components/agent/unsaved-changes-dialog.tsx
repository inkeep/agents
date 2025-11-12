import { type FC, useCallback, useTransition, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useRouter } from 'next/navigation';

type PendingNavigation = () => void;

interface UnsavedChangesDialogProps {
  onSubmit: () => Promise<boolean>;
}

export const UnsavedChangesDialog: FC<UnsavedChangesDialogProps> = ({ onSubmit }) => {
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isSavingPendingNavigation, startSavingPendingNavigation] = useTransition();
  const dirty = useAgentStore((state) => state.dirty);
  const pendingNavigationRef = useRef<PendingNavigation>(null);
  const isNavigatingRef = useRef(false);
  const router = useRouter();

  const handleGoBack = useCallback(() => {
    pendingNavigationRef.current = null;
    setShowUnsavedDialog(false);
  }, []);

  const proceedWithNavigation = useCallback(() => {
    const navigate = pendingNavigationRef.current;
    handleGoBack();

    if (!navigate) {
      return;
    }
    isNavigatingRef.current = true;
    navigate();
  }, [handleGoBack]);

  const handleSaveAndLeave = useCallback(() => {
    if (!pendingNavigationRef.current || isSavingPendingNavigation) {
      return;
    }
    startSavingPendingNavigation(async () => {
      const saved = await onSubmit();
      if (saved) {
        proceedWithNavigation();
      }
      setShowUnsavedDialog(false);
    });
  }, [isSavingPendingNavigation, onSubmit, proceedWithNavigation]);

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
      const el = (event.target as HTMLElement | null)?.closest('a[href]');
      const href = (el as HTMLAnchorElement | null)?.href;
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
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
  }, [dirty, handleGoBack]);

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
          <Button onClick={handleSaveAndLeave} disabled={isSavingPendingNavigation}>
            {isSavingPendingNavigation ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
