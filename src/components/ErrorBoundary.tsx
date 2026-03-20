import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold text-text-primary mb-3">Something went wrong</h1>
          <p className="text-text-secondary mb-6">An unexpected error occurred.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = "/";
            }}
            className="btn btn-primary"
          >
            Go home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
