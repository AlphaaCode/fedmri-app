"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { EASE_OUT } from "@/lib/anim";

/** Counts up to `value` on mount (and whenever value changes). */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1.1,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: EASE_OUT });
    return controls.stop;
  }, [mv, value, duration]);

  return <motion.span className={className}>{text}</motion.span>;
}
