import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  FolderKanban,
  LayoutGrid,
  LogOut,
  PlaySquare,
  Settings2,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getUserInitials, cn } from "@/lib/utils";
import iconUrl from "../../../icon.png";

interface DashboardSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const navItems = [
  { icon: LayoutGrid, label: "Overview", href: "/dashboard" },
  { icon: FolderKanban, label: "Projects", href: "/dashboard" },
  { icon: PlaySquare, label: "Studio", href: "/studio" },
  { icon: User, label: "Profile", href: "/profile" },
  { icon: Settings2, label: "Settings", href: "/profile" },
];

export const DashboardSidebar = ({
  collapsed = false,
  onToggle,
}: DashboardSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const userEmail = user?.email || "";
  const userName = user?.user_metadata?.full_name || "";
  const userAvatar = user?.user_metadata?.avatar_url || "";

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
    navigate("/");
  };

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col bg-[#121a2b] text-white shadow-[inset_-1px_0_0_rgba(120,130,150,0.08)] transition-all duration-300",
        collapsed ? "w-[76px]" : "w-[250px]"
      )}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(180,197,255,1),rgba(97,139,255,1))] text-[#002469]">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-white">GitFlick</div>
                <div className="truncate text-xs text-white/45">Workspace</div>
              </div>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </div>

      {user ? (
        <div className={cn("p-4 pt-0", collapsed && "px-3")}>
          {collapsed ? (
            <Link to="/profile" className="flex justify-center">
              <Avatar className="h-11 w-11 ring-1 ring-white/10">
                <AvatarImage src={userAvatar} alt={userName || userEmail} />
                <AvatarFallback className="bg-primary/20 text-primary">
                  {getUserInitials(userName, userEmail)}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3 transition hover:bg-white/[0.06]"
            >
              <Avatar className="h-11 w-11 ring-1 ring-white/10">
                <AvatarImage src={userAvatar} alt={userName || userEmail} />
                <AvatarFallback className="bg-primary/20 text-primary">
                  {getUserInitials(userName, userEmail)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {userName || "User"}
                </p>
                <p className="truncate text-xs text-white/50">{userEmail}</p>
              </div>
            </Link>
          )}
        </div>
      ) : null}

      <nav className="flex-1 space-y-1.5 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname === item.href;

          return (
            <Link
              key={item.label}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-white/65 hover:bg-white/[0.05] hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 pt-5">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-white/60 hover:text-white",
            collapsed ? "justify-center" : "justify-start"
          )}
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? <span className="ml-2">Log out</span> : null}
        </Button>
      </div>
    </aside>
  );
};
