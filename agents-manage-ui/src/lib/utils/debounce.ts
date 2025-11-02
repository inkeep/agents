/**
 * Provided a duration and a function, returns a new function which is called
 * `duration` milliseconds after the last call.
 */
export function debounce<F extends (...args: any[]) => any>(duration: number, fn: F) {
  let timeout = 0;
  return (...args: any[]) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      timeout = 0;
      fn(...args);
    }, duration);
  };
}
