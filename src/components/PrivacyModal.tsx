import { Modal, Typography } from "antd";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";

const { Paragraph, Title } = Typography;

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PrivacyModal({ open, onClose }: PrivacyModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Privacy">
      <Title level={5} style={{ marginTop: 0 }}>Your brand stays on your device</Title>
      <Paragraph>
        Brand Board runs entirely in your browser. Your business name, colors,
        fonts, and logo live only in your tab while you work, plus a local draft
        so you don't lose progress. Nothing is uploaded to a server.
      </Paragraph>
      <Paragraph>
        No cookies, no tracking, no analytics, no account required. The PNG and
        PDF you export are generated in your browser and never leave your device
        until you share them.
      </Paragraph>
      <DeeBuiltCredit />
    </Modal>
  );
}
