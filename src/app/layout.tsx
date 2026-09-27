import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Repomap — Understand any GitHub codebase",
    template: "%s · Repomap",
  },
  description:
    "Paste a GitHub repository and turn it into structured AI-ready context you can understand, explore, and chat with.",
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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
