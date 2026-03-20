import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import iconUrl from "../../icon.png";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const { resetPassword } = useAuth();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await resetPassword(email);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message || "Could not send reset email. Please try again.",
        variant: "destructive",
      });
    } else {
      setEmailSent(true);
    }
  };

  if (emailSent) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />

        <div className="relative z-10 w-full max-w-[420px] rounded-[28px] gf-panel-glass p-6 text-center sm:p-7">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-emerald-300/12 text-emerald-200">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-[1.8rem] font-semibold tracking-tight text-white">Check your email</h1>
          <p className="mt-3 text-[0.95rem] leading-7 text-white/60">
            We sent a secure password reset link to <span className="font-medium text-white">{email}</span>.
          </p>

          <div className="mt-6 space-y-3">
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">Back to login</Link>
            </Button>
            <Button variant="ghost" className="w-full text-white/62 hover:text-white" onClick={() => setEmailSent(false)}>
              Try another email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.12]" />
      <div className="absolute left-[8%] top-[18%] h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute bottom-[12%] right-[10%] h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-[960px] items-center justify-center">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <section className="hidden lg:block">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </Button>

            <div className="mt-14 max-w-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05]">
                  <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
                </div>
                <div className="font-headline text-2xl font-semibold text-white">GitFlick</div>
              </div>

              <div className="mt-12 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">
                Account recovery
              </div>
              <h1 className="gf-headline mt-4 text-5xl font-extrabold leading-[0.96] tracking-[-0.05em] text-white">
                Reset access.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-white/62">
                Use the email linked to your account and we’ll send a reset link.
              </p>

              <div className="mt-8 rounded-[24px] gf-panel-soft p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
                  <div className="text-sm leading-6 text-white/58">
                    Reset links are short-lived and keep the same workspace ownership intact.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="w-full">
            <div className="mx-auto max-w-[420px] rounded-[28px] gf-panel-glass p-6 sm:p-7">
              <div className="lg:hidden">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">
                    <ArrowLeft className="h-4 w-4" />
                    Back to login
                  </Link>
                </Button>
              </div>

              <div className="mt-4 lg:mt-0">
                <h2 className="text-[2rem] font-semibold tracking-tight text-white">Reset your password</h2>
                <p className="mt-3 text-[0.95rem] leading-7 text-white/60">
                  Enter the email tied to your account and we&apos;ll send a secure reset link.
                </p>
              </div>

              <form onSubmit={handleResetPassword} className="mt-7 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[11px] uppercase tracking-[0.24em] text-white/44">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    required
                    className="h-12 rounded-[16px] text-[0.95rem]"
                  />
                </div>

                <Button type="submit" className="h-12 w-full rounded-[16px] text-base" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send reset link
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-white/52">
                Remember your password?{" "}
                <Link to="/login" className="font-semibold text-primary transition hover:text-white">
                  Sign in
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
