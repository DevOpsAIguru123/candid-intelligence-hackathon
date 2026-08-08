import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: "Speaker Signal | Candid Intelligence",
  description: "Conference intelligence for energy infrastructure origination.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
