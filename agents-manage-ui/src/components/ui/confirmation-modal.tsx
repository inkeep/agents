'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ConfirmationVariant = 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

const variantConfig = {
  danger: {
    icon: AlertTriangle,
    iconClassName: 'h-5 w-5 text-red-600 dark:text-red-400',
    confirmButtonVariant: 'destructive' as const,
  },
  warning: {
    icon: AlertTriangle,
    iconClassName: 'h-5 w-5 text-amber-600 dark:text-amber-400',
    confirmButtonVariant: 'default' as const,
  },
  info: {
    icon: AlertTriangle,
    iconClassName: 'h-5 w-5 text-blue-600 dark:text-blue-400',
    confirmButtonVariant: 'default' as const,
  },
};

export function ConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText = 'Cancel',
  variant = 'info',
  onConfirm,
  isLoading = false,
}: ConfirmationModalProps) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  const handleConfirm = async () => {
    await onConfirm();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoading) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <IconComponent className={config.iconClassName} />
            {title}
          </DialogTitle>
          <DialogDescription className="text-left">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={config.confirmButtonVariant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
