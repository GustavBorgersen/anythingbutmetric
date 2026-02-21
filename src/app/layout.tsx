import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Absolute Unit",
  description:
    "Convert any quantity into absurd-but-sourced journalistic units — Double-Decker Buses, Olympic Swimming Pools, Wales, Whales.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
