import { Typography } from "antd";

const { Link, Text } = Typography;

/** The "Made by DeeBuilt" credit in the footer and the About and Privacy modals. */
export default function DeeBuiltCredit() {
  return (
    <Text type="secondary" className="bb-text-fine">
      Made by{" "}
      <Link href="https://deebuilt.co" target="_blank" rel="noopener noreferrer" className="bb-text-fine">
        DeeBuilt
      </Link>
    </Text>
  );
}
