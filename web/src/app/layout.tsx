import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rada Pism — Inkasso NO · Kosztorys OC/AC PL",
  description:
    "Zrozum pismo po polsku i przygotuj odpowiedź. Panel 3 modeli AI weryfikuje dokumenty — pilotaż z weryfikacją w 24h. Norwegia (inkasso) i Polska (kosztorys OC/AC).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
