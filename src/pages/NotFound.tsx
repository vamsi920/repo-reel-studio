import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import iconUrl from "../../icon.png";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.16]" />
      <div className="absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[12%] right-[12%] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-[760px] rounded-[32px] gf-panel p-8 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)] sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <img src={iconUrl} alt="GitFlick" className="h-8 w-8" />
        </div>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Route not found
        </div>
        <h1 className="mt-5 text-6xl font-extrabold tracking-[-0.04em] text-white">404</h1>
        <p className="mt-4 text-xl font-semibold text-white">That page does not exist in this workspace.</p>
        <p className="mx-auto mt-3 max-w-xl text-[0.98rem] leading-7 text-white/60">
          The route <span className="font-mono text-white/80">{location.pathname}</span> could not be resolved. Return to the main intake flow or jump back into your dashboard.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Return home
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard">
              <Search className="h-4 w-4" />
              Open dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
