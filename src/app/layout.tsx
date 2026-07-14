import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "TendaPay | Milestone payments for independent work",
  description:
    "Create milestone terms, collect stablecoin payments, and release work automatically.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
