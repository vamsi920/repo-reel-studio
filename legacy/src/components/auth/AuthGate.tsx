import { ReactNode } from "react";

interface AuthGateProps {
  children: ReactNode;
  message?: string;
  title?: string;
  fullScreen?: boolean;
  featureName?: string;
}

export const AuthGate = ({ children }: AuthGateProps) => <>{children}</>;

export function withAuthGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  gateProps?: Omit<AuthGateProps, "children">
) {
  return function AuthGatedComponent(props: P) {
    return <WrappedComponent {...props} />;
  };
}
