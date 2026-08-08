import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "BestAiCom Semantic Workspace",
    description: "A BestAiCom operations intelligence workspace for semantic maps, application APIs, and approved AI automation.",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
      googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
    },
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "BestAiCom Semantic Workspace", description: "A BestAiCom operations intelligence workspace for semantic maps, application APIs, and approved AI automation.", images: [{ url: `${origin}/og.png`, width: 1792, height: 921 }] },
    twitter: { card: "summary_large_image", title: "BestAiCom Semantic Workspace", description: "A BestAiCom operations intelligence workspace for semantic maps, application APIs, and approved AI automation.", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={cn("font-sans", geist.variable)}><body className={`${geist.variable} ${mono.variable}`}>{children}</body></html>;
}
