export async function register() {
  console.log('Registering instrumentation for agents-manage-ui');
  if (process.env.SENTRY_DSN) {
    console.log('SENTRY_DSN is set');
    try {
      const Sentry = require('@sentry/nextjs');
      console.log('Initializing Sentry');
      Sentry.init({
        debug: !!process.env.SENTRY_DEBUG,
        dsn: process.env.SENTRY_DSN,
        sendDefaultPii: true,
        integrations: [],
        // Enable logs to be sent to Sentry
        enableLogs: true,
        sampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE ?? '1.0') || 1.0,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.0') || 0.0,
      });
      console.log('Sentry initialized successfully');

      // Test message to verify Sentry is working
      Sentry.captureMessage('Sentry initialized successfully in agents-manage-ui', 'info');
    } catch (error) {
      console.error('Failed to initialize Sentry', error);
    }
  } else {
    console.log('SENTRY_DSN is not set');
  }
}
