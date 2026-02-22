import React from "react";
import { useStdin } from "ink";

const { useEffect, useRef } = React;

/**
 * Returns a ref that is true immediately after the raw '\x7f' byte is read
 * from stdin and false after any other byte. This lets useInput callers
 * distinguish macOS Backspace (\x7f → key.delete=true) from real Forward-
 * Delete (\x1b[3~ → also key.delete=true), which are otherwise identical.
 *
 * Uses Ink's internal_eventEmitter with prependListener so our handler
 * fires BEFORE use-input.js parses the keypress.
 */
export function useRawBackspace(): React.MutableRefObject<boolean> {
  const rawWasBackspace = useRef(false);
  const { internal_eventEmitter } = useStdin() as {
    internal_eventEmitter: {
      prependListener: (e: string, h: (d: string) => void) => void;
      removeListener:  (e: string, h: (d: string) => void) => void;
    };
  };
  useEffect(() => {
    const handler = (chunk: string) => {
      rawWasBackspace.current = chunk === "\x7f";
    };
    internal_eventEmitter.prependListener("input", handler);
    return () => { internal_eventEmitter.removeListener("input", handler); };
  }, [internal_eventEmitter]);
  return rawWasBackspace;
}
