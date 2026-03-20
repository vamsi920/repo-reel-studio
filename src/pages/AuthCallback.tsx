import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import iconUrl from "../../icon.png";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          navigate('/login?error=auth_failed', { replace: true });
          return;
        }

        if (session) {
          // Successfully authenticated
          navigate('/dashboard', { replace: true });
        } else {
          // No session, redirect to login
          navigate('/login', { replace: true });
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        navigate('/login?error=auth_failed', { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.18]" />
      <div className="absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[14%] right-[12%] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-[460px] px-4">
        <div className="rounded-[30px] gf-panel-glass p-7 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <img src={iconUrl} alt="GitFlick" className="h-9 w-9" />
          </div>
          <h1 className="mt-5 text-[1.9rem] font-semibold tracking-tight text-white">
            Completing sign-in
          </h1>
          <p className="mt-3 text-[0.98rem] leading-7 text-white/60">
            Finalizing your secure session and syncing workspace access.
          </p>

          <div className="mt-6 rounded-[22px] bg-[#171f33] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <div className="mt-4 text-sm font-semibold text-white">Authorizing account</div>
            <div className="mt-1 text-sm leading-6 text-white/58">
              GitFlick is validating your identity and preparing private workspace routes.
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.22em] text-white/40">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Secure callback in progress
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
