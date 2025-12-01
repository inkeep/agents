'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class HydrationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's a hydration error (React error #418 or #423)
    const isHydrationError =
      error.message?.includes('Hydration') ||
      error.message?.includes('hydration') ||
      error.message?.includes('did not match') ||
      error.message?.includes('#418') ||
      error.message?.includes('#423');

    if (isHydrationError) {
      // Hydration errors are expected with theme provider, ignore them
      console.warn('Hydration error caught and suppressed:', error.message);
      return { hasError: false, error: null };
    }

    // Re-throw non-hydration errors
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const isHydrationError =
      error.message?.includes('Hydration') ||
      error.message?.includes('hydration') ||
      error.message?.includes('did not match') ||
      error.message?.includes('#418') ||
      error.message?.includes('#423');

    if (isHydrationError) {
      // Don't log hydration errors to console, they're expected
      return;
    }

    // Log real errors
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Only show error UI for non-hydration errors
      throw this.state.error;
    }

    return this.props.children;
  }
}
