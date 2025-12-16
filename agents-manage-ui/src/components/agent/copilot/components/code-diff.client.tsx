import dynamic from 'next/dynamic';

export const CodeDiff = dynamic(() => import('./code-diff').then((m) => m.CodeDiff), {
  ssr: false,
  loading: () => <div>Loading...</div>,
});
