import { Modal, Typography } from "antd";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";

const { Paragraph, Title } = Typography;

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="About Brand Board">
      <Title level={5} style={{ marginTop: 0 }}>A free tool from DeeBuilt</Title>
      <Paragraph>
        Brand Board turns your colors, fonts, and logo into a designed one-page
        brand reference. Paste a palette, upload a logo, pick a font pairing, and
        watch the board build live.
      </Paragraph>
      <Paragraph>
        When it looks right, export a high-resolution PNG for sharing or a
        print-ready PDF to hand off. It pairs with Palette Studio for colors and
        Icon Kit for logos, so a whole brand kit comes together in one place.
      </Paragraph>
      <DeeBuiltCredit />
    </Modal>
  );
}
