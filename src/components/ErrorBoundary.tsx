import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface PageErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = import.meta.env.DEV;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-2xl w-full">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Something went wrong</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">An error occurred while rendering this page.</p>
            {isDevelopment && (
              <div className="bg-gray-100 dark:bg-gray-800 rounded p-4 overflow-auto">
                <pre className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap">
                  {this.state.error?.message}
                </pre>
                <pre className="text-xs text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap">
                  {this.state.error?.stack}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, State> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-lg w-full text-center">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Page Error</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Something went wrong loading this page.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-xs text-left text-red-800 dark:text-red-300 bg-gray-100 dark:bg-gray-800 rounded p-3 mb-4 overflow-auto whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
              >
                Try Again
              </button>
              <a
                href="/"
                className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
