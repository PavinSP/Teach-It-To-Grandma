import { useEffect, useRef } from "react";
import { subscribe, PRIORITY } from "./ticker";

// Rides the shared loop for as long as `enabled` is true.
//
// The callback is held in a ref rather than in the dependency array on
// purpose: a component that rebuilds its callback every render — which is
// every component that closes over state — would otherwise unsubscribe and
// resubscribe sixty times a second, and the subscriber list would churn
// while it is being iterated.
export function useTicker(fn, enabled = true, priority = PRIORITY.RENDER) {
  const callback = useRef(fn);

  // Refreshed after every render rather than during it. The subscriber can
  // therefore run one frame behind a brand-new callback, which is invisible
  // at 60fps and is the price of not churning the subscriber list.
  useEffect(() => {
    callback.current = fn;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribe((now, dt) => callback.current(now, dt), priority);
  }, [enabled, priority]);
}
