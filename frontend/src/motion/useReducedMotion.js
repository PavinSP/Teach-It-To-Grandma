import { useSyncExternalStore } from "react";
import { prefersReducedMotion, subscribeToMotion } from "./reducedMotion";

// The answer, as React state, updated when the OS setting changes or the
// in-app toggle is flipped. useSyncExternalStore rather than an effect and a
// useState: the value is read during render, so a component can pick its
// variant on the first paint instead of animating once and then correcting.
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotion,
    prefersReducedMotion,
    () => true // server / no-DOM: assume calm, never animate into a hydration.
  );
}
