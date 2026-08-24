import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { LogOut, User } from "lucide-react";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { signOutAndRedirect } from "#/lib/data-platform/auth-flow";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { I18nKey } from "#/i18n/declaration";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { cn } from "#/utils/utils";
import { dropdownTriggerShellClassName } from "#/utils/dropdown-classes";
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import {
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";

const ICON_SIZE = 18;

interface SidebarUserMenuProps {
  collapsed: boolean;
}

/**
 * Persistent user identity + sign-out affordance in the sidebar rail. Only
 * renders for a real (non-anonymous) Supabase session -- with the route
 * gate in root.tsx, that's the only state this should ever mount in, but it
 * stays defensive so it degrades to nothing instead of a broken row if
 * rendered while the session is still resolving or unconfigured.
 */
export function SidebarUserMenu({ collapsed }: SidebarUserMenuProps) {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const { status, user } = useSupabaseSession();
  const [open, setOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const menuRef = useClickOutsideElement<HTMLUListElement>(() =>
    setOpen(false),
  );

  const email = user?.email;

  if (status !== "real" || !email) return null;

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((prev) => !prev);
  };

  const handleSignOut = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsSigningOut(true);
    await signOutAndRedirect(navigate);
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid={
          collapsed ? "collapsed-user-menu-trigger" : "user-menu-trigger"
        }
        aria-label={email}
        aria-expanded={open}
        onClick={handleToggle}
        className={
          collapsed
            ? sidebarNavRowClassName({ collapsed: true })
            : cn(dropdownTriggerShellClassName, "cursor-pointer")
        }
      >
        {collapsed ? (
          <SidebarCollapsedIconSlot active={open}>
            <User width={ICON_SIZE} height={ICON_SIZE} />
          </SidebarCollapsedIconSlot>
        ) : (
          <>
            <User width={16} height={16} className="shrink-0" />
            <span className="truncate">{email}</span>
          </>
        )}
        {collapsed ? (
          <span className={sidebarNavLabelClassName(true)}>{email}</span>
        ) : null}
      </button>
      {open ? (
        <div
          className={
            collapsed
              ? "absolute bottom-0 left-full z-40 w-[240px] pl-2.5"
              : "absolute bottom-full left-0 z-40 mb-2 w-full"
          }
        >
          <ContextMenu ref={menuRef} testId="user-menu" theme="popover">
            <li className="truncate px-2 py-2 text-xs text-[var(--oh-muted)]">
              {email}
            </li>
            <ContextMenuListItem
              testId="sidebar-sign-out-button"
              onClick={handleSignOut}
              isDisabled={isSigningOut}
            >
              <LogOut width={16} height={16} className="shrink-0" />
              {t(I18nKey.SETTINGS$SIGN_OUT)}
            </ContextMenuListItem>
          </ContextMenu>
        </div>
      ) : null}
    </div>
  );
}
