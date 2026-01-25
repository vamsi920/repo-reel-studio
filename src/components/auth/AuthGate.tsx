import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, LogIn, Sparkles } from 'lucide-react';
import iconUrl from '../../../icon.png';

interface AuthGateProps {
  children: ReactNode;
  /** Message to show when user needs to authenticate */
  message?: string;
  /** Title for the auth prompt */
  title?: string;
  /** Whether to show a full-screen gate or inline */
  fullScreen?: boolean;
  /** Feature name to show in the prompt */
  featureName?: string;
}

/**
 * AuthGate component - Shows content only if user is authenticated
 * Otherwise shows a login prompt with a nice UI
 * 
 * UX Philosophy: Phase 1 (ingestion/processing) works without login,
 * but Phase 2 (Studio editing, export) requires authentication
 */
export const AuthGate = ({ 
  children, 
  message = "Sign in to continue with your video project",
  title = "Authentication Required",
  fullScreen = true,
  featureName = "this feature"
}: AuthGateProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (isLoading) {
    if (fullScreen) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // If authenticated, render children
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Not authenticated - show login prompt
  const LoginPrompt = () => (
    <Card variant="elevated" className="max-w-md w-full mx-4">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <Lock className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="text-base">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Benefits list */}
        <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            What you get with an account:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Save and access your video projects</li>
            <li>Export videos in multiple formats</li>
            <li>Access to Studio editing features</li>
            <li>Sync across devices</li>
          </ul>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" asChild>
            <Link to="/login" state={{ from: location.pathname }}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Free forever • No credit card required
        </p>
      </CardContent>
    </Card>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute inset-0 bg-radial-gradient" />
        
        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-glow-secondary/5 rounded-full blur-3xl" />

        <div className="relative z-10 w-full flex flex-col items-center">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            <span className="font-semibold text-lg">GitFlick</span>
          </div>
          
          <LoginPrompt />
        </div>
      </div>
    );
  }

  return <LoginPrompt />;
};

/**
 * Higher-order component to wrap a component with AuthGate
 */
export function withAuthGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  gateProps?: Omit<AuthGateProps, 'children'>
) {
  return function AuthGatedComponent(props: P) {
    return (
      <AuthGate {...gateProps}>
        <WrappedComponent {...props} />
      </AuthGate>
    );
  };
}
