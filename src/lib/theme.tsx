import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfigProvider, Grid, theme as antdTheme } from "antd";

type Mode = "light" | "dark";

interface ThemeCtx {
  mode: Mode;
  toggle: () => void;
  setMode: (m: Mode) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "brand-board-theme";

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY) as Mode | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(getInitialMode);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      setMode,
      toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")),
    }),
    [mode],
  );

  return (
    <Ctx.Provider value={value}>
      <ConfigProvider
        // On phones every control renders at "large" size, and we raise the
        // large-control height to a proper 48px tap target. AntD computes each
        // control's internal layout from this token, so heights stay consistent
        // and text stays centered — no CSS height-hacking required.
        componentSize={isMobile ? "large" : "middle"}
        theme={{
          algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: "#2f4f46",
            colorInfo: "#2f4f46",
            borderRadius: 8,
            controlHeightLG: 48,
            // Raise AntD's base font on phones so EVERY control it renders
            // (dropdown text, input text, table cells, buttons) reads larger
            // without hand-styling each one. This is the global type lever.
            fontSize: isMobile ? 16 : 14,
            // The UI face lives in tokens.css; AntD writes this straight into
            // its CSS, so the variable resolves at render time.
            fontFamily: "var(--ops-font-ui)",
            // Lato ships 400 and 700 only. AntD's default strong weight is 600,
            // which every `Text strong`, Title and modal title reads; pin it to
            // the real bold so the UI never asks for a third weight.
            fontWeightStrong: 700,
          },
          components: {
            Button: {
              fontWeight: 700,
            },
            Table: mode === "dark" ? undefined : { headerBg: "#f9fafb", headerColor: "#374151" },
            // Selected dropdown row: a light tint of the brand green instead of
            // AntD's default flat gray fill. Translucent so it reads as a soft
            // highlight in both light and dark mode.
            Select: {
              optionSelectedBg: mode === "dark" ? "rgba(228,196,154,0.16)" : "rgba(47,79,70,0.08)",
              optionSelectedColor: mode === "dark" ? "#E4C49A" : "#2f4f46",
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </Ctx.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useThemeMode must be used inside ThemeProvider");
  return ctx;
}
