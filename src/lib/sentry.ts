import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  // Only initialise when a DSN is configured (production / staging)
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Only send traces in production to keep quota low during development
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0,
    // Replay 10 % of sessions, 100 % of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Scrub PII / PHI from breadcrumbs and event payloads
    beforeSend(event) {
      if (event.request?.data) {
        event.request.data = '[Filtered]';
      }
      return event;
    },
  });
}

export { Sentry };
