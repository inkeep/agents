import './src/env';
import { defaultSDK } from './src/instrumentation';
defaultSDK.start();
import app from './src/index';

export const runtime = 'nodejs';
export default app;
