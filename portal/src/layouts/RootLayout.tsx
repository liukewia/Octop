import { MotionConfig } from "framer-motion";
import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/Navbar";

export function RootLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-white">
        <Navbar />
        <Outlet />
      </div>
    </MotionConfig>
  );
}
