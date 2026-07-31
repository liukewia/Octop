import { Outlet } from "react-router-dom";

export function RootLayout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Outlet />
    </div>
  );
}
