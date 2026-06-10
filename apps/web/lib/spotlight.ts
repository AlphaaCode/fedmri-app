"use client";

import type { MouseEvent } from "react";

/** Sets --mx/--my on the hovered element so the `.spotlight` radial gradient
 *  follows the cursor. Spread onto any element with the `spotlight` class:
 *  `<div className="spotlight …" {...spotlightHandlers}>` */
export const spotlightHandlers = {
  onMouseMove(e: MouseEvent<HTMLElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  },
};
