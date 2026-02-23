import React from "react";

const { useState, useEffect } = React;

export function useElapsedTime(running: boolean | null): string {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (running === false) return; // loop stopped — freeze timer
    const id = setInterval(() => {
      setSeconds((s: number) => s + 5);
    }, 5000);
    return () => clearInterval(id);
  }, [running]);

  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
