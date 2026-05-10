"use client";

import { Component, type ReactNode } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="mx-auto max-w-lg p-4">
            <ErrorDisplay
              error={this.state.error?.message ?? "Đã xảy ra lỗi"}
              variant="banner"
            />
          </div>
        )
      );
    }

    return this.props.children;
  }
}
