"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Onboarding is now an InsightsModal overlay shown by the layout.
// This route redirects anyone who lands here directly back to the dashboard.
export default function OnboardingRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/patient"); }, [router]);
  return null;
}
