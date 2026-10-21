import type { ReactNode } from "react";
import { LayoutOutlined } from "@ant-design/icons";
import "@/styles/header.css";

/**
 * AppHeader — Brand Board's own sticky header: board mark + tool name on the
 * left, page controls (theme toggle, etc.) on the right. Colors come from the
 * --app-header-* variables in header.css, which flip with the html.dark class
 * ThemeProvider toggles.
 */
export default function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="app-header__title">
        <LayoutOutlined className="app-header__mark" aria-hidden />
        <h1 className="app-header__name">Brand Board</h1>
      </div>
      <div className="app-header__actions">{actions}</div>
    </header>
  );
}
