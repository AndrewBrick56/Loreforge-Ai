import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/orbitron/wght.css";
import "./globals.css";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AppProviders } from "@/components/layout/app-providers";

export const metadata: Metadata = {
  title: "LoreForge AI — Your Imagination. Your Characters.",
  description:
    "Transform ordinary photos into extraordinary AI characters. Create, customize and unleash your imagination.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <div className="lf-bg-ambient" aria-hidden="true" />
        <AppProviders>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}