import React from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: React.ReactNode;
  /** Optional fallback — defaults to the full-page error UI */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const errorId = Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? '' } },
    });
    this.setState({ errorId });
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-premium-lg flex items-center justify-center mx-auto">
              <i className="ri-error-warning-line text-red-500 text-2xl"></i>
            </div>

            <div>
              <h1 className="text-xl font-bold text-brand-900 mb-2">Something went wrong</h1>
              <p className="text-sm text-brand-500 leading-relaxed">
                An unexpected error occurred. The issue has been reported automatically.
                Try refreshing the page — if the problem persists, contact support.
              </p>
            </div>

            {this.state.errorId && (
              <p className="text-xs text-brand-300 font-mono">
                Error ID: {this.state.errorId}
              </p>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-sm font-semibold rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm cursor-pointer"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.assign('/dashboard')}
                className="px-5 py-2.5 border border-border text-brand-600 text-sm font-medium rounded-premium hover:bg-brand-50 transition-colors cursor-pointer"
              >
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
