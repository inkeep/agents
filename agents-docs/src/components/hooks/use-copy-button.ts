'use client';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';

export function useCopyButton(onCopy: () => void): [checked: boolean, onClick: MouseEventHandler] {
  const [checked, setChecked] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const callbackRef = useRef(onCopy);

  useEffect(() => {
    callbackRef.current = onCopy;
  }, [onCopy]);

  const onClick: MouseEventHandler = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setChecked(false);
    }, 1500);
    callbackRef.current();
    setChecked(true);
  };

  // Avoid updates after being unmounted
  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return [checked, onClick];
}
