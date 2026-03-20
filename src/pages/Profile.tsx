import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Loader2,
  LogOut,
  Mail,
  Save,
  Shield,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { formatDate, getUserInitials } from "@/lib/utils";
import iconUrl from "../../icon.png";

const Profile = () => {
  const { user, isLoading: authLoading, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    }
  }, [user]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsUpdating(true);
    const { error } = await updateProfile({ full_name: fullName });
    setIsUpdating(false);

    if (error) {
      toast({
        title: 'Update failed',
        description: error.message || 'Could not update profile. Please try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully.',
      });
    }
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    await signOut();
    toast({
      title: 'Signed out',
      description: 'You have been signed out successfully.',
    });
    navigate('/', { replace: true });
  };

  if (authLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
        <div className="absolute inset-0 bg-radial-gradient" />
        <div className="absolute inset-0 gf-grid-overlay opacity-[0.18]" />
        <div className="relative rounded-[24px] gf-panel-glass px-8 py-7 text-center shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-[0.95rem] text-white/60">Loading account workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userEmail = user.email || '';
  const userName = user.user_metadata?.full_name || '';
  const userAvatar = user.user_metadata?.avatar_url || '';
  const createdAt = user.created_at ? formatDate(user.created_at) : 'Unknown';
  const provider = user.app_metadata?.provider || 'email';
  const providerLabel =
    provider === "google"
      ? "Google"
      : provider === "github"
        ? "GitHub"
        : provider === "email"
          ? "Email & Password"
          : provider;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-radial-gradient" />
      <div className="absolute inset-0 gf-grid-overlay opacity-[0.16]" />
      <div className="absolute left-[8%] top-[14%] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[14%] right-[10%] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative z-10">
        <header className="gf-nav-shell sticky top-0 z-20">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6 xl:px-8">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
              </div>
              <div>
                <div className="font-headline text-[1.35rem] font-semibold text-white">GitFlick</div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/36">Account workspace</div>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                  Back to dashboard
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="text-white/70 hover:text-white"
              >
                {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 xl:px-8">
          <section className="overflow-hidden rounded-[30px] gf-panel shadow-[0_24px_56px_rgba(8,14,30,0.28)]">
            <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(104,132,255,0.12),rgba(17,24,39,0.45),rgba(107,216,203,0.08))] p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              <Avatar className="h-24 w-24 ring-1 ring-white/10">
                <AvatarImage src={userAvatar} alt={userName || userEmail} />
                <AvatarFallback className="bg-primary/18 text-2xl text-primary">
                  {getUserInitials(userName, userEmail)}
                </AvatarFallback>
              </Avatar>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Personal workspace
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  {userName || "Your profile"}
                </h1>
                <p className="mt-2 text-[0.98rem] leading-7 text-white/60">{userEmail}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">Signed in with {providerLabel}</div>
                  <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">Member since {createdAt}</div>
                  <div className="gf-tag rounded-full px-4 py-2 text-xs font-medium">Free plan</div>
                </div>
              </div>

              <div className="rounded-[22px] bg-[#131b2e] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  <Sparkles className="h-4 w-4" />
                  Workspace posture
                </div>
                <div className="mt-3 text-[0.95rem] leading-6 text-white/62">
                  Your account controls access to saved walkthroughs, export history, repo memory, and future agent operations.
                </div>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <section className="rounded-[26px] gf-panel p-6 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
              <div className="flex items-start gap-3">
                <div className="rounded-[18px] bg-primary/12 p-2.5 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                    Profile settings
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    Update your account details
                  </h2>
                  <p className="mt-2 text-[0.95rem] leading-6 text-white/58">
                    Keep your account metadata current so workspace ownership and collaboration surfaces stay accurate.
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-[11px] uppercase tracking-[0.24em] text-white/44">
                    Full name
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isUpdating}
                    className="h-12 rounded-[16px] text-[0.95rem]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[11px] uppercase tracking-[0.24em] text-white/44">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={userEmail}
                    disabled
                    className="h-12 rounded-[16px] bg-white/[0.04] text-[0.95rem]"
                  />
                  <p className="text-xs text-white/38">
                    Email cannot be changed from this surface.
                  </p>
                </div>
                <Button type="submit" className="h-12 rounded-[16px] px-6 text-base" disabled={isUpdating}>
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </form>
            </section>

            <aside className="space-y-6">
              <section className="rounded-[26px] gf-panel p-5 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
                <div className="flex items-center gap-3">
                  <div className="rounded-[18px] bg-accent/12 p-2.5 text-accent">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/36">
                      Account posture
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">Security and identity</div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-[18px] bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/34">
                      <Mail className="h-3.5 w-3.5" />
                      Sign-in method
                    </div>
                    <div className="mt-1 text-[0.95rem] font-medium text-white">{providerLabel}</div>
                  </div>
                  <div className="rounded-[18px] bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/34">
                      <Calendar className="h-3.5 w-3.5" />
                      Member since
                    </div>
                    <div className="mt-1 text-[0.95rem] font-medium text-white">{createdAt}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-[26px] gf-panel p-5 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  Plan and billing
                </div>
                <h3 className="mt-2 text-lg font-semibold text-white">Free plan</h3>
                <p className="mt-2 text-[0.95rem] leading-6 text-white/58">
                  Unlimited local generation and secure workspace recovery. Premium workspace controls can ship later without changing the account surface.
                </p>
                <div className="mt-4 rounded-[18px] bg-[#111a34]/70 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="text-sm font-semibold text-white">Current allowance</div>
                  <div className="mt-2 text-sm leading-6 text-white/58">
                    Export access, saved manifests, private watch routes, and repository memory are all available in the current plan.
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() =>
                    toast({
                      title: "Coming soon",
                      description: "Premium workspace controls are not live yet.",
                    })
                  }
                >
                  View upgrade path
                </Button>
              </section>

              <section className="rounded-[26px] border border-rose-300/18 bg-[#151d38] p-5 shadow-[0_20px_48px_rgba(8,14,30,0.24)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-200/70">
                  Danger zone
                </div>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-white">Sign out of this device</div>
                    <div className="mt-2 text-[0.95rem] leading-6 text-white/58">
                      End the current session while keeping your saved projects and exports tied to the account.
                    </div>
                  </div>
                </div>
                <Button 
                  variant="destructive"
                  className="mt-5"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Sign Out
                </Button>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Profile;
