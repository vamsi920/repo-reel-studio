import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getUserInitials } from "@/lib/utils";
import iconUrl from "../../icon.png";

const LANDING_LINKS = [
  { label: "Walkthrough", href: "#walkthrough" },
  { label: "Graph", href: "#graph" },
  { label: "Q&A", href: "#qa" },
  { label: "Agent Ops", href: "#agent-ops" },
];

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, isLoading, signOut } = useAuth();

  const userEmail = user?.email || "";
  const userName = user?.user_metadata?.full_name || "";
  const userAvatar = user?.user_metadata?.avatar_url || "";
  const isHome = location.pathname === "/";

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  return (
    <nav className="gf-nav-shell fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={iconUrl} alt="GitFlick" className="h-6 w-6 opacity-90" />
            <span className="block font-headline text-[1.35rem] font-semibold tracking-tight text-white">
              GitFlick
            </span>
          </Link>

          <div className="hidden items-center gap-6 lg:flex">
            {LANDING_LINKS.map((item) =>
              isHome ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm font-medium text-white/68 transition hover:text-white"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to="/"
                  className="text-sm font-medium text-white/68 transition hover:text-white"
                >
                  {item.label}
                </Link>
              )
            )}
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {isLoading ? (
            <div className="h-11 w-28 animate-pulse rounded-2xl bg-white/[0.08]" />
          ) : isAuthenticated && user ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to="/dashboard">
                  <LayoutGrid className="h-4 w-4" />
                  Workspace
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex h-10 items-center gap-2 rounded-2xl bg-white/[0.04] px-2"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userAvatar} alt={userName || userEmail} />
                      <AvatarFallback className="bg-primary/25 text-primary">
                        {getUserInitials(userName, userEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[140px] truncate text-sm font-medium lg:block">
                      {userName || userEmail.split("@")[0]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {userName || "User"}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {userEmail}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="cursor-pointer">
                      <LayoutGrid className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/login">Open Workspace</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04] text-white md:hidden"
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="px-4 py-4 md:hidden">
          <div className="space-y-2 rounded-[24px] gf-panel-glass p-4">
            {LANDING_LINKS.map((item) =>
              isHome ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="block rounded-2xl px-3 py-2.5 text-[0.95rem] font-medium text-white/82 transition hover:bg-white/[0.05]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to="/"
                  className="block rounded-2xl px-3 py-2.5 text-[0.95rem] font-medium text-white/82 transition hover:bg-white/[0.05]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              )
            )}

            {isAuthenticated && user ? (
              <div className="space-y-2 pt-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <LayoutGrid className="h-4 w-4" />
                    Dashboard
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    void handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <Button variant="outline" className="w-full" asChild>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button className="w-full" asChild>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    Open Workspace
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
};
