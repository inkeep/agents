import type { FC } from 'react';
import { Spinner } from '@/components/ui/spinner';

const Loading: FC = () => {
  return (
    <div className="flex items-center justify-center h-full">
      <Spinner />
    </div>
  );
};

export default Loading;
