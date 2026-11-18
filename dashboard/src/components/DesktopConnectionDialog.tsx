import { useEffect, useState } from "react";
import { Modal } from "antd";
import DesktopConnectionPanel from "../pages/Settings/AdvancedSettings/DesktopConnectionPanel";
import { getDesktopBridge, isDesktopShell } from "../utils/desktopBridge";
import { onConnectionMenu } from "../utils/connectionMenu";

/** Cloud-instance form opened from the application menu, not the updates page. */
export default function DesktopConnectionDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => onConnectionMenu(() => setOpen(true)), []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    return getDesktopBridge()?.onOpenConnection?.(() => setOpen(true));
  }, []);

  if (!isDesktopShell()) return null;

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      destroyOnHidden
      onCancel={() => setOpen(false)}
      width={520}
    >
      <DesktopConnectionPanel />
    </Modal>
  );
}
