import { useState, type ReactNode } from "react";
import { Layout, Space, Switch, Typography } from "antd";
import { SunOutlined, MoonOutlined } from "@ant-design/icons";
import AppHeader from "@/components/AppHeader";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import AboutModal from "@/components/AboutModal";
import PrivacyModal from "@/components/PrivacyModal";

const { Content, Footer } = Layout;
const { Link, Text } = Typography;

/**
 * Shell — the chrome wrapper for Brand Board. Renders the app header
 * ("Brand Board" / dark toggle), the page content, and the footer
 * (About · Privacy · Made by DeeBuilt).
 *
 * `headerActions` injects page-specific controls into the header's right region,
 * to the right of the dark-mode toggle. Don't place primary buttons on the page
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
      <SunOutlined
        style={{
          opacity: isDark ? 0.4 : 1,
          fontSize: 13,
          color: isDark ? "#94A3B8" : "#64748B",
        }}
      />
      <Switch
        checked={isDark}
        onChange={() => {
          haptic('tap');
          toggle();
        }}
        size="small"
      />
      <MoonOutlined
        style={{
          opacity: isDark ? 1 : 0.4,
          fontSize: 13,
          color: isDark ? "#E4C49A" : "#94A3B8",
        }}
      />
      {headerActions}
    </>
  );

  return (
    <Layout style={{ minHeight: "100vh", background: isDark ? "#000" : "#f5f6f8" }}>
      <AppHeader actions={headerExtras} />

      <Content style={{ background: isDark ? "#000" : "#f5f6f8" }}>{children}</Content>

      <Footer
        style={{
          textAlign: "center",
          background: "transparent",
          padding: "16px 24px 24px",
          fontSize: 12,
        }}
      >
        <Space size={8} wrap style={{ justifyContent: "center" }}>
          <Link onClick={() => setAboutOpen(true)} style={{ fontSize: 12 }}>
            About
          </Link>
          <Text type="secondary">·</Text>
          <Link onClick={() => setPrivacyOpen(true)} style={{ fontSize: 12 }}>
            Privacy
          </Link>
          <Text type="secondary">·</Text>
          <DeeBuiltCredit />
        </Space>
      </Footer>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </Layout>
  );
}
