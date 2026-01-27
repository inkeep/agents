'use client';

import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useSlack } from '../context/slack-provider';

const AUTO_DISMISS_MS = 5000;

export function NotificationBanner() {
  const { ui, actions } = useSlack();
  const notification = ui.notification;

  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      actions.clearNotification();
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [notification, actions]);

  if (!notification) {
    return null;
  }

  return (
    <div
      className={`mb-4 p-4 rounded-lg flex items-center justify-between ${
        notification.type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {notification.type === 'success' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertCircle className="h-5 w-5" />
        )}
        {notification.message}
      </div>
      <button
        type="button"
        onClick={() => actions.clearNotification()}
        className="p-1 hover:bg-black/5 rounded"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
