import type { Metadata, Viewport } from "next";
import { AppearanceRuntime } from "./appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agency",
  description: "A private workspace for finished work, evidence and decisions.",
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
};

const appearanceScript = `try{var p=localStorage.getItem('agency-appearance');document.documentElement.dataset.theme=p==='light'||p==='dark'?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.querySelector('meta[name="theme-color"]').content=document.documentElement.dataset.theme==='dark'?'#172630':'#edf2f5'`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><meta name="theme-color" content="#edf2f5" /><script dangerouslySetInnerHTML={{ __html: appearanceScript }} /></head><body><AppearanceRuntime />{children}</body></html>;
}
