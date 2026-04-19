import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KSM Studio",
  description: "Idea evaluation pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before hydration — sets data-theme on <html> to avoid flash on public pages */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var o=localStorage.getItem('ksm-theme-override');if(o==='light'||o==='dark'){document.documentElement.dataset.theme=o;}else{var h=new Date().getHours();document.documentElement.dataset.theme=(h>=6&&h<18)?'light':'dark';}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
