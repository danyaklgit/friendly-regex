import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Rendered in place of the children once they have thrown. */
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Minimal error boundary. A class because React exposes error boundaries only
 * through class lifecycle methods; everything else in the codebase is a
 * function component. First use: the lazy-loaded Reports tab, whose chunk
 * fetch can fail offline or after a redeploy rotates the chunk hash.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
