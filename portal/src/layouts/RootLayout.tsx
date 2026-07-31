import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/Navbar";

export function RootLayout() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a" }}>
      <Navbar />
      <Outlet />
    </div>
  );
}
