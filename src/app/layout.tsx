import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TEMS | Tactical Equipment Management System",
  description: "Tactical Equipment Management System - กองบิน 41",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full`} suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var saved=localStorage.getItem('tems-theme');var theme=saved==='dark'||saved==='light'?saved:'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light';}})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
