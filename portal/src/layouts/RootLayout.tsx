import { MotionConfig } from "framer-motion";
import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/Navbar";

export function RootLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <div style={{ minHeight: "100vh", background: "#fff" }}>
        <Navbar />
        <Outlet />
      </div>
    </MotionConfig>
  );
}
