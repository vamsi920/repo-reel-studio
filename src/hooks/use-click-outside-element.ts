import React from "react";

/**
 * Hook to call a callback function when an element is clicked outside
 * @param callback The callback function to call when the element is clicked outside
 */
export const useClickOutsideElement = <T extends HTMLElement>(
  callback: () => void,
  ignoreOutsideClickRef?: React.RefObject<HTMLElement | null>,
) => {
  const ref = React.useRef<T>(null);
  // Hold the latest callback in a ref so the listener effect doesn't
  // re-register every render when callers pass an inline arrow function.
  const callbackRef = React.useRef(callback);
  React.useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current) return;
      if (ref.current.contains(target)) return;
      if (ignoreOutsideClickRef?.current?.contains(target)) return;
      callbackRef.current();
    };

    // `mousedown`, not `click`: a trigger's own onClick handler (e.g. this
    // element's toggle button) can flip state and mount `ref.current`
    // *before* the browser finishes dispatching that same click to this
    // listener, since React's root-level event delegation doesn't stop a
    // handler's `stopPropagation()` from reaching a plain
    // `document.addEventListener` the way it stops other React handlers.
    // The result was a menu opening and immediately closing itself on the
    // very click that opened it. Listening on `mousedown` sidesteps this
    // entirely: it fires before the click (and any state change) it's
    // paired with, so the opening gesture is never mistaken for an
    // outside click.
    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ignoreOutsideClickRef]);

  return ref;
};
