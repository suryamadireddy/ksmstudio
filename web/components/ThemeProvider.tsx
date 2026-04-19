"use client";

import { useEffect } from "react";
import { resolveTheme } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const apply = () => {
      const override = localStorage.getItem("ksm-theme-override") as
        | "light"
        | "dark"
        | null;
      document.documentElement.dataset.theme = resolveTheme(override);
    };
    apply();
    const interval = setInterval(apply, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}
