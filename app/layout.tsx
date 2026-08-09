import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: "GTM Intelligence Agent | Candid Intelligence",
  description: "Autonomous Go-To-Market event & lead intelligence agent for executive outreach origination.",
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
