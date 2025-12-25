import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { WindowManagerProvider } from "@/components/desktop/WindowManager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tony Toubia | Enterprise AI Leader & Mad Scientist",
  description:
    "VP, Global Salesforce Lead at Merkle. Building the 5% of AI that actually works. Specializing in agentic AI, Salesforce, and business value realization.",
  keywords: [
    "Tony Toubia",
    "Enterprise AI",
    "Agentic AI",
    "Salesforce",
    "Data Cloud",
    "Marketing Cloud",
    "Agentforce",
    "Business Value",
    "Kansas City",
    "Merkle",
    "dentsu",
  ],
  authors: [{ name: "Tony Toubia" }],
  openGraph: {
    title: "Tony Toubia | Enterprise AI Leader & Mad Scientist",
    description:
      "Building the 5% of AI that actually works. Specializing in agentic AI, Salesforce, and business value realization.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tony Toubia | Enterprise AI Leader",
    description: "Building the 5% of AI that actually works.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <WindowManagerProvider>{children}</WindowManagerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
