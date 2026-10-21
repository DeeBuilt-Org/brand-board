import { Typography } from "antd";

const { Link, Text } = Typography;

/** The "Made by DeeBuilt" credit in the footer and the About and Privacy modals. */
export default function DeeBuiltCredit() {
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      Made by{" "}
      <Link href="https://deebuilt.co" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
        DeeBuilt
      </Link>
    </Text>
  );
}
