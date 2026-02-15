import type { Metadata } from "next";
import "./globals.css";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "DoR Gatekeeper - Jira Quality Gate",
  description: "Definition of Ready (DoR) quality gate for Jira backlogs with async Slack Q&A loops",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-gray-50">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
