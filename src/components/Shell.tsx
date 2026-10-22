import { useState, type ReactNode } from "react";
import { Button, Layout, Space, Tooltip, Typography } from "antd";
import { SunOutlined, MoonOutlined } from "@ant-design/icons";
import AppHeader, { SwatchesMark } from "@/components/AppHeader";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import AboutModal from "@/components/AboutModal";
import PrivacyModal from "@/components/PrivacyModal";
import "@/styles/shell.css";

const { Content, Footer } = Layout;
const { Link, Text } = Typography;

/**
 * Shell — the chrome wrapper for Brand Board. Renders the app header
 * (lockup / theme toggle), the page content, and the footer
 * (About · Privacy · Made by DeeBuilt).
 *
 * `headerActions` injects page-specific controls into the header's right region,
 * to the right of the theme toggle. Don't place primary buttons on the page
 * body.
 */
export default function Shell({
  children,
  headerActions,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
}) {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === "dark";
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const headerExtras = (
    <>
      <Tooltip title={isDark ? "Light mode" : "Dark mode"}>
        <Button
          type="text"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          icon={isDark ? <SunOutlined /> : <MoonOutlined />}
          onClick={() => {
            haptic("tap");
            toggle();
          }}
          className="app-header__btn"
        />
      </Tooltip>
      {headerActions}
    </>
  );

  return (
    <Layout className="bb-shell">
      <AppHeader mark={<SwatchesMark />} name="Brand Board" actions={headerExtras} />

      <Content className="bb-shell__content">{children}</Content>

      <Footer className="bb-shell__footer">
        <Space size={8} wrap className="bb-shell__footer-links">
          <Link onClick={() => setAboutOpen(true)}>About</Link>
          <Text type="secondary">·</Text>
          <Link onClick={() => setPrivacyOpen(true)}>Privacy</Link>
          <Text type="secondary">·</Text>
          <DeeBuiltCredit />
        </Space>
      </Footer>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </Layout>
  );
}
