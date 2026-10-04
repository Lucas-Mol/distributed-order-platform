import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const archivoBlack = Archivo_Black({
  weight: "400",
  variable: "--font-archivo-black",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Order Platform",
    template: "%s · Order Platform",
  },
  description: "Catalog, cart and order tracking",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
