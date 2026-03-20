import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Github,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import iconUrl from "../../icon.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"google" | "github" | null>(null);

  const {
    signInWithEmail,
    signInWithGoogle,
    signInWithGithub,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string })?.from || "/dashboard";

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter your email and password.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailLoading(true);
    const { error } = await signInWithEmail(email, password);
    setIsEmailLoading(false);

    if (error) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "You have been logged in successfully.",
      });
      navigate(from, { replace: true });
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setOauthProvider(provider);
    const action = provider === "google" ? signInWithGoogle : signInWithGithub;
    const { error } = await action();
    setOauthProvider(null);

    if (error) {
      toast({
        title: `${provider === "google" ? "Google" : "GitHub"} sign-in failed`,
        description: error.message || "Could not start OAuth login.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />
      <div className="absolute left-[8%] top-[16%] h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute bottom-[10%] right-[8%] h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1100px] items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <section className="hidden lg:block">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/74 transition hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>

            <div className="mt-14 max-w-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05]">
                  <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
                </div>
                <div className="font-headline text-2xl font-semibold tracking-tight text-white">GitFlick</div>
              </div>

              <div className="mt-12 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/42">
                Account access
              </div>
              <h1 className="gf-headline mt-4 text-4xl font-semibold leading-[1.02] tracking-tight text-white">
                Welcome back.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-white/62">
                Sign in to reopen saved workspaces and continue where you left off.
              </p>

              <div className="mt-8 max-w-[520px] rounded-xl gf-panel-soft p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
                  <div>
                    <div className="text-sm font-semibold text-white">Private by default</div>
                    <div className="mt-2 text-sm leading-6 text-white/58">
                      Repository context, saved manifests, and exports stay tied to your account.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="w-full">
            <div className="mx-auto max-w-[420px] rounded-xl gf-panel-glass p-6 sm:p-7">
              <div className="lg:hidden">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/74 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to home
                </Link>
              </div>

              <div className="mt-4 lg:mt-0">
                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Welcome back
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Use Google, GitHub, or email to continue.
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-12 justify-center rounded-[16px] text-[0.95rem]"
                  disabled={oauthProvider !== null}
                  onClick={() => void handleOAuth("google")}
                >
                  {oauthProvider === "google" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-black/70 text-xs font-bold text-white">
                      G
                    </div>
                  )}
                  Google
                </Button>
                <Button
                  variant="outline"
                  className="h-12 justify-center rounded-[16px] text-[0.95rem]"
                  disabled={oauthProvider !== null}
                  onClick={() => void handleOAuth("github")}
                >
                  {oauthProvider === "github" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="h-4 w-4" />
                  )}
                  GitHub
                </Button>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <div className="h-px flex-1 gf-divider" />
                <div className="text-xs uppercase tracking-[0.32em] text-white/34">
                  Or email
                </div>
                <div className="h-px flex-1 gf-divider" />
              </div>

              <form onSubmit={handleEmailLogin} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[11px] uppercase tracking-[0.26em] text-white/46">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isEmailLoading || oauthProvider !== null}
                    autoComplete="email"
                    className="h-12 rounded-[16px] text-[0.95rem]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-[11px] uppercase tracking-[0.26em] text-white/46">
                      Password
                    </Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-semibold uppercase tracking-[0.2em] text-primary transition hover:text-white"
                    >
                      Forgot?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isEmailLoading || oauthProvider !== null}
                    autoComplete="current-password"
                    className="h-12 rounded-[16px] text-[0.95rem]"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-[16px] text-base"
                  disabled={isEmailLoading || oauthProvider !== null}
                >
                  {isEmailLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Initialize Session
                </Button>
              </form>

              <p className="mt-5 text-sm text-white/44">
                Your saved workspace stays account-scoped and private.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
