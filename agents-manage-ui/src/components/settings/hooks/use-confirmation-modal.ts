import { useState } from 'react';

export interface UseConfirmationModalOptions<T = any> {
  onConfirm: (data: T) => Promise<void>;
}

export function useConfirmationModal<T = any>(options: UseConfirmationModalOptions<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const openModal = (modalData: T) => {
    setData(modalData);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setData(null);
    setIsLoading(false);
  };

  const handleConfirm = async () => {
    if (!data) return;

    setIsLoading(true);
    try {
      await options.onConfirm(data);
      closeModal();
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  return {
    isOpen,
    data,
    isLoading,
    openModal,
    closeModal,
    handleConfirm,
  };
}
