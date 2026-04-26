import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareMap Genie",
  description: "Natural-language analytics over India healthcare facility data",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
