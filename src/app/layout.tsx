import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AISettingsGate } from "@/components/ai/ai-settings-gate";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TITLE = "RepoTutor — Understand Any GitHub Codebase";
const DESCRIPTION =
  "Turn any public GitHub repository into an interactive guide. Explore architecture, understand files, trace code flows, and chat with the codebase.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: "%s · RepoTutor",
  },
  description: DESCRIPTION,
  applicationName: "RepoTutor",
  keywords: ["github", "codebase", "repository analysis", "AI", "developer tools", "code understanding"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "RepoTutor",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

/** Applies the persisted theme before first paint to avoid a flash. */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset["theme"] = theme;
  } catch (e) {
    document.documentElement.dataset["theme"] = "dark";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <AISettingsGate>{children}</AISettingsGate>
      </body>
    </html>
  );
}
