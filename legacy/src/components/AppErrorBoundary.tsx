import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-lg rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-6">
          <h1 className="text-lg font-semibold text-red-600">App failed to start</h1>
          <p className="mt-2 text-sm text-foreground/70">{this.state.error.message}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Check browser DevTools console. Confirm <code className="text-foreground/70">VITE_FIREBASE_*</code>{" "}
            is set in <code className="text-foreground/70">.env</code>, then restart{" "}
            <code className="text-foreground/70">npm run dev</code>.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-black/[0.06] px-4 py-2 text-sm hover:bg-black/[0.1]"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
