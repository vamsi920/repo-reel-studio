import { createContext, useContext, ReactNode } from "react";

const LOCAL_USER = {
  uid: "local-user",
  email: "local@localhost",
  displayName: "Local User",
  photoURL: null as string | null,
  emailVerified: true,
  metadata: { creationTime: "2024-01-01T00:00:00.000Z" },
  providerData: [{ providerId: "password" }],
};

interface AuthContextType {
  user: typeof LOCAL_USER;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithGithub: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updateProfile: (data: { full_name?: string; avatar_url?: string }) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

const noop = async () => ({ error: null });

const value: AuthContextType = {
  user: LOCAL_USER,
  isLoading: false,
  isAuthenticated: true,
  signInWithEmail: noop,
  signUpWithEmail: noop,
  signInWithGoogle: noop,
  signInWithGithub: noop,
  signOut: async () => {},
  resetPassword: noop,
  updateProfile: noop,
};

export const AuthProvider = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
);
