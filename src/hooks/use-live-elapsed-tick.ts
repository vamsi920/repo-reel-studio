import { useEffect, useState } from "react";

/**
 * Forces a re-render once a second so any "elapsed" value derived from
 * `Date.now()` at render time keeps advancing, even when the underlying
 * query data hasn't changed (a poll that returns byte-identical JSON keeps
 * the same object reference and triggers no re-render on its own).
 *
 * Pass `active` so the interval only runs while there's something whose
 * elapsed time can still change (e.g. a non-terminal run).
 */
export function useLiveElapsedTick(active: boolean) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}
