'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the component stack as a string, not as an object: in a production
    // build the error message itself is a minified React code with no context,
    // and an object-valued second argument is easy to miss in a log pipeline.
    // The component stack is what actually identifies where the failure was.
    console.error(
      'ErrorBoundary caught an error:',
      error,
      '\ncomponentStack:',
      errorInfo?.componentStack ?? '(none)',
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        // Last-resort recovery UI for client-only conversation failures.
        <div className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-destructive mb-4">
              Something went wrong
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              An error occurred while loading the conversation. Please try refreshing the page.
            </p>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    // Happy path: render the wrapped conversation subtree unchanged.
    return this.props.children;
  }
}
