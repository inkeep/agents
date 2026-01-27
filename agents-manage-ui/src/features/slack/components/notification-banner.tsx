'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSlack } from '../context/slack-provider';

export function NotificationBanner() {
  const { ui } = useSlack();
  const notification = ui.notification;

  if (!notification) {
    return null;
  }

  return (
    <div
      className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
        notification.type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
      }`}
    >
      {notification.type === 'success' ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <AlertCircle className="h-5 w-5" />
      )}
      {notification.message}
    </div>
  );
}
