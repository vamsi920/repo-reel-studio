import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  Terminal, 
  FolderOpen, 
  Users, 
  CreditCard, 
  Key, 
  ChevronLeft,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export const DashboardSidebar = ({ collapsed, onToggle }: DashboardSidebarProps) => {
  const location = useLocation();

  const navItems = [
    { icon: FolderOpen, label: "Projects", href: "/dashboard" },
    { icon: Users, label: "Team Settings", href: "/dashboard/team" },
    { icon: CreditCard, label: "Billing", href: "/dashboard/billing" },
    { icon: Key, label: "API Keys", href: "/dashboard/api" },
  ];

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Terminal className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground">Repo-to-Reel</span>
          )}
        </Link>
        <button
          onClick={onToggle}
          className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-sidebar-foreground/70 hover:text-sidebar-foreground",
            collapsed ? "justify-center" : "justify-start"
          )}
          asChild
        >
          <Link to="/">
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Log out</span>}
          </Link>
        </Button>
      </div>
    </aside>
  );
};
