import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/Navbar";

export function RootLayout() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t("app.pageTitle");
  }, [t]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-white">
        <Navbar />
        <Outlet />
      </div>
    </MotionConfig>
  );
}
