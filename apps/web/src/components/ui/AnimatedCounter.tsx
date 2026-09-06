"use client";

import { useEffect, useState } from "react";

export interface AnimatedCounterProps {
  target: number;
  durationMs?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * AnimatedCounter creates a smooth kinetic count-up animation
 * using requestAnimationFrame and an exponential ease-out curve.
 * Automatically respects prefers-reduced-motion.
 */
export function AnimatedCounter({
  target,
  durationMs = 900,
  className = "",
  prefix = "",
  suffix = "",
}: AnimatedCounterProps) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const timer = setTimeout(() => {
        setCount(target);
      }, 0);
      return () => clearTimeout(timer);
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / durationMs, 1);

      // Exponential ease-out curve: fast start, soft deceleration
      const easeOutProgress =
        progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const currentVal = Math.round(target * easeOutProgress);

      setCount(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [target, durationMs]);

  return (
    <span
      suppressHydrationWarning
      className={`tabular-nums inline-block ${className}`}
    >
      {prefix}
      {count}
      {suffix}
    </span>
  );
}
