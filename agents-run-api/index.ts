import './src/env';

const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  const { defaultSDK } = await import('./src/instrumentation.js');
  defaultSDK.start();
}

const appModule = await import('./src/index.js');
const app = appModule.default;

export const runtime = 'nodejs';
export default app;
