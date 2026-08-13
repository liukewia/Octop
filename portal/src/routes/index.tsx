import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/layouts/RootLayout";
import { HomePage } from "@/pages/Home";
import { NotFoundPage } from "@/pages/NotFound";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
    // Catch-all redirect
    { path: "*", element: <Navigate to="/" replace /> },
  ],
{
    basename: "/Octop",
    future: {
      v7_startTransition: true,
    },
  },
);
