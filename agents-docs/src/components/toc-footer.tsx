'use client';

import { FeedbackDialog } from './feedback-dialog';
import { NewsletterSignup } from './newsletter-signup';

export function TocFooter() {
  return (
    <div className="toc-footer">
      <NewsletterSignup />
      <FeedbackDialog />
    </div>
  );
}
