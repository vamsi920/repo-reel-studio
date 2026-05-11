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
    <nav className="fixed inset-x-0 top-0 z-50 glass border-b border-white/[0.08]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-lg blur-md opacity-60 group-hover:opacity-100 transition-opacity" />
              <img src={iconUrl} alt="GitFlick" className="relative h-8 w-8" />
            </div>
            <span className="text-xl font-bold gradient-text">
              GitFlick
            </span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {LANDING_LINKS.map((item) =>
              isHome ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground rounded-lg hover:bg-white/[0.05] transition-all"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to="/"
                  className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground rounded-lg hover:bg-white/[0.05] transition-all"
                >
                  {item.label}
                </Link>
              )
            )}
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {isLoading ? (
            <div className="h-10 w-28 skeleton" />
          ) : isAuthenticated && user ? (
            <>
              <button className="btn-subtle">
                <Link to="/dashboard" className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span>Workspace</span>
                </Link>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-10 items-center gap-2 px-2 pr-3 rounded-xl glass-hover glass transition-all">
                    <Avatar className="h-8 w-8 ring-2 ring-white/10">
                      <AvatarImage src={userAvatar} alt={userName || userEmail} />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-medium">
                        {getUserInitials(userName, userEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[140px] truncate text-sm font-medium text-foreground lg:block">
                      {userName || userEmail.split("@")[0]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 glass border-white/10">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold gradient-text">
                        {userName || "User"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {userEmail}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem asChild className="focus:bg-white/[0.08]">
                    <Link to="/dashboard" className="cursor-pointer">
                      <LayoutGrid className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="focus:bg-white/[0.08]">
                    <Link to="/profile" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <button className="btn-ghost">
                <Link to="/login">Sign in</Link>
              </button>
              <button className="btn-premium">
                <Link to="/login" className="flex items-center gap-2">
                  <span>Open Workspace</span>
                </Link>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {!isLoading && !isAuthenticated ? (
            <Button size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04] text-white"
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
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
