import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "RoleWide | Search wider. Choose smarter.",
    template: "%s | RoleWide",
  },
  description:
    "Search wider and choose smarter across Australia's technology opportunities, with evidence-backed employer, role, and regional intelligence.",
  openGraph: {
    siteName: "RoleWide",
    title: "RoleWide | Search wider. Choose smarter.",
    description:
      "Evidence-backed Australian technology opportunity intelligence.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RoleWide | Search wider. Choose smarter.",
    description:
      "Evidence-backed Australian technology opportunity intelligence.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-canvas text-navy-900 font-sans antialiased"
      >
        {children}
      </body>
    </html>
  );
}
