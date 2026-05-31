"use client";

import { useEffect } from "react";
import { usePortalChrome } from "./portal-chrome";

/** A page calls this to set the portal top-bar title. */
export function usePortalTitle(title: string): void {
  const setTitle = usePortalChrome((s) => s.setTitle);
  useEffect(() => {
    setTitle(title);
  }, [title, setTitle]);
}
