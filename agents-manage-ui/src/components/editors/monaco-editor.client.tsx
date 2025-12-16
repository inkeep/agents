import dynamic from 'next/dynamic';

export const MonacoEditor = dynamic(() => import('./monaco-editor').then((m) => m.MonacoEditor), {
  ssr: false,
  loading: () => <div>Loading...</div>,
});
