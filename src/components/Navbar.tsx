import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, User, LogOut, Settings, ChevronDown, Sparkles } from "lucide-react";
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
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getUserInitials } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import iconUrl from "../../icon.png";

export const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLanding = location.pathname === "/";
  
  const { user, isAuthenticated, isLoading, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  const handleComingSoon = (feature: string) => {
    toast({
      title: "Coming Soon",
      description: `${feature} is coming soon!`,
    });
  };

  const navLinks = [
    { label: "Features", href: "#features", onClick: () => handleComingSoon("Features page") },
    { label: "Pricing", href: "#pricing", onClick: () => handleComingSoon("Pricing") },
    { label: "Docs", href: "#docs", onClick: () => handleComingSoon("Documentation") },
  ];

  const userEmail = user?.email || "";
  const userName = user?.user_metadata?.full_name || "";
  const userAvatar = user?.user_metadata?.avatar_url || "";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <img src={iconUrl} alt="GitFlick" className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <span className="font-semibold text-foreground block">GitFlick</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Repo to Reel
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          {isLanding && (
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={link.onClick}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              // Loading state
              <div className="h-8 w-20 bg-muted animate-pulse rounded-md" />
            ) : isAuthenticated && user ? (
              // Authenticated state - show user menu
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userAvatar} alt={userName || userEmail} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getUserInitials(userName, userEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium max-w-[120px] truncate hidden lg:block">
                      {userName || userEmail.split("@")[0]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
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
                      <Sparkles className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleComingSoon("Settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // Not authenticated - show login/signup buttons
              <>
                <Button variant="nav" size="sm" asChild>
                  <Link to="/login">Login</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/login">Get Started</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-2">
              {isLanding &&
                navLinks.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => {
                      link.onClick?.();
                      setMobileMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground text-left"
                  >
                    {link.label}
                  </button>
                ))}
              <div className="flex flex-col gap-2 pt-2 border-t border-border mt-2">
                {isLoading ? (
                  <div className="h-10 bg-muted animate-pulse rounded-md mx-4" />
                ) : isAuthenticated && user ? (
                  <>
                    {/* User info */}
                    <div className="px-4 py-2 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={userAvatar} alt={userName || userEmail} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getUserInitials(userName, userEmail)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {userName || "User"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {userEmail}
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/dashboard"
                      className="px-4 py-2 text-sm hover:bg-accent rounded-md mx-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/profile"
                      className="px-4 py-2 text-sm hover:bg-accent rounded-md mx-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setMobileMenuOpen(false);
                      }}
                      className="px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md mx-2 text-left"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="justify-start mx-2" asChild>
                      <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                    </Button>
                    <Button size="sm" className="mx-2" asChild>
                      <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
