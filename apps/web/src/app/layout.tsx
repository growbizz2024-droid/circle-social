import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppTheme from "../components/app-theme";
const chillax = localFont({
  src: "../../../../assets/brand/fonts/Chillax-Variable.woff2",
  variable: "--font-heading",
  weight: "200 700",
  display: "swap",
});
const inter = localFont({
  src: "../../../../assets/brand/fonts/InterVariable.ttf",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Circle.social — Real People. Open Conversations.",
  description:
    "Discover communities, share experiences, and join open conversations on Circle.social.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${chillax.variable} ${inter.variable}`}
    >
      <body className="min-h-full flex flex-col"><AppTheme>{children}</AppTheme></body>
    </html>
  );
}
