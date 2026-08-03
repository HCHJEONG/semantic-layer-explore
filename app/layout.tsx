import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "Semantic Layer Explorer",
    description: "A minimal Ontology → Database → API → AI demo.",
    icons: { icon: "/favicon.svg" },
    openGraph: { title: "Semantic Layer Explorer", description: "A minimal Ontology → Database → API → AI demo.", images: [{ url: `${origin}/og.png`, width: 1792, height: 921 }] },
    twitter: { card: "summary_large_image", title: "Semantic Layer Explorer", description: "A minimal Ontology → Database → API → AI demo.", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
