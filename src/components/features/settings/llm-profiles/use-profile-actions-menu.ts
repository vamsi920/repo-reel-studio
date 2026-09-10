import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface UseProfileActionsMenuOptions {
  /**
   * Element the menu anchors against. When provided, the menu renders into a
   * body portal with fixed positioning so it isn't clipped by scroll
   * containers.
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

/**
 * Shared behaviour for the LLM / agent profile row action menus: portal
 * positioning, roving focus between enabled items, click-outside / Escape
 * dismissal, and handing focus back to the trigger when the menu goes away.
 */
export function useProfileActionsMenu({
  anchorRef,
  onClose,
}: UseProfileActionsMenuOptions) {
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const anchorElement = anchorRef?.current ?? null;
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>();
  const isPortaled = Boolean(anchorElement);
  // A portaled menu renders nothing until its position is known, so its
  // items only exist once `portalStyle` has been computed.
  const itemsMounted = !isPortaled || Boolean(portalStyle);

  useLayoutEffect(() => {
    if (!anchorElement) return undefined;

    const updatePosition = () => {
      const rect = anchorElement.getBoundingClientRect();
      if (!rect) return;
      const gap = 8;
      setPortalStyle({
        position: "fixed",
        zIndex: 9999,
        top: rect.bottom + gap,
        right: window.innerWidth - rect.right,
        width: "max-content",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement]);

  /**
   * Focus the first enabled item found by walking `step` from `from`,
   * wrapping around. Disabled items (e.g. "Set as default" on the active
   * profile) are skipped so arrow keys never get stuck on them.
   */
  const focusItemFrom = useCallback((from: number, step: 1 | -1) => {
    const items = menuItemsRef.current;
    const count = items.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const index = (((from + step * offset) % count) + count) % count;
      const item = items[index];
      if (item && !item.disabled) {
        item.focus();
        return;
      }
    }
  }, []);

  // Focus the first item once the items actually exist in the DOM.
  useEffect(() => {
    if (!itemsMounted) return;
    focusItemFrom(-1, 1);
  }, [itemsMounted, focusItemFrom]);

  // Return focus to the trigger when the menu unmounts while focus is still
  // inside it (Escape, Tab, or an item action), so keyboard users don't get
  // dropped back to <body>. Layout cleanup runs before the DOM is removed,
  // so `activeElement` still reflects where focus was.
  useLayoutEffect(
    () => () => {
      const active = document.activeElement;
      if (active && menuRef.current?.contains(active)) {
        anchorElement?.focus();
      }
    },
    [anchorElement],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorElement?.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [anchorElement, onClose]);

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      if (e.key === "Tab") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItemFrom(currentIndex, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItemFrom(currentIndex, -1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusItemFrom(-1, 1);
      } else if (e.key === "End") {
        e.preventDefault();
        focusItemFrom(0, -1);
      }
    },
    [onClose, focusItemFrom],
  );

  return {
    menuRef,
    menuItemsRef,
    isPortaled,
    portalStyle,
    handleAction,
    handleKeyDown,
  };
}
