import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, LogIn, ShieldCheck } from "lucide-react";
import iconUrl from "../../../icon.png";

interface AuthGateProps {
  children: ReactNode;
  message?: string;
  title?: string;
  fullScreen?: boolean;
  featureName?: string;
}

export const AuthGate = ({
  children,
  message = "Sign in to continue with your video project",
  title = "Authentication Required",
  fullScreen = true,
}: AuthGateProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    if (fullScreen) {
      return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
          <div className="absolute inset-0 bg-radial-gradient" />
          <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />
          <div className="relative rounded-[24px] gf-panel-glass px-8 py-7 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-[0.95rem] text-white/60">Checking secure workspace access...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const loginPrompt = (
    <div className="mx-4 w-full max-w-[420px] rounded-[28px] gf-panel-glass p-6 sm:p-7">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary/12 text-primary">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-[1.9rem] font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-3 text-[0.95rem] leading-7 text-white/60">{message}</p>
      </div>

      <div className="mt-6 rounded-[22px] bg-white/[0.04] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
          <div className="text-sm leading-6 text-white/58">
            Sign in to reopen saved workspaces and keep exports, repo context, and Studio access in one account.
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <Button size="lg" className="w-full" asChild>
          <Link to="/login" state={{ from: location.pathname }}>
            <LogIn className="h-4 w-4" />
            Sign In
          </Link>
        </Button>
        <Button variant="ghost" className="w-full text-white/62 hover:text-white" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-white/34">No extra setup required</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />

        <div className="relative z-10 flex w-full flex-col items-center">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05]">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            <span className="font-headline text-[1.35rem] font-semibold text-white">GitFlick</span>
          </div>
          {loginPrompt}
        </div>
      </div>
    );
  }

  return loginPrompt;
};

export function withAuthGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  gateProps?: Omit<AuthGateProps, "children">
) {
  return function AuthGatedComponent(props: P) {
    return (
      <AuthGate {...gateProps}>
        <WrappedComponent {...props} />
      </AuthGate>
    );
  };
}
