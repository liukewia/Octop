import { useTranslation } from "react-i18next";

import OctopSpinner from "../OctopSpinner";
import styles from "./BrandLoading.module.less";

interface BrandLoadingProps {
  /** Status line beside the arc. Defaults to the shared loading label. */
  label?: string;
  /** Cover the viewport. Route fallbacks fill their parent instead. */
  viewport?: boolean;
}

/**
 * Non-shell loading state: shared arc and status line without glow or brand
 * logo (those stay on the desktop shell's own splash screen).
 */
export default function BrandLoading({ label, viewport }: BrandLoadingProps) {
  const { t } = useTranslation();

  return (
    <div
      className={viewport ? `${styles.host} ${styles.viewport}` : styles.host}
      role="status"
      aria-live="polite"
    >
      <div className={styles.stack}>
        <p className={styles.status}>
          <OctopSpinner />
          <span>{label ?? t("common.loading")}</span>
        </p>
      </div>
    </div>
  );
}
