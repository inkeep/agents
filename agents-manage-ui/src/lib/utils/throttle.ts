/**
 * Throttle ensures a function runs at most once every X milliseconds, no matter how many times the event fires.
 */
export function throttle<F extends (...args: any[]) => any>(delay: number, fn: F) {
  let last = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - last >= delay) {
      fn(...args);
      last = now;
    }
  }) as F;
}
