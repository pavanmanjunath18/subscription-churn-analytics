import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/nav";
import { FixtureBanner } from "@/components/ui";
import { REPO } from "@/lib/data";

export const metadata: Metadata = {
  title: "Subscription Churn Analytics",
  description:
    "Revenue, retention and churn analysis of 2+ years of real music-streaming subscription data (KKBox), with an out-of-time churn model backtest.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen">
        <FixtureBanner />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="text-[15px] font-semibold">Subscription Churn Analytics</Link>
            <Nav />
          </header>
          <main className="pb-16">{children}</main>
          <footer className="border-t py-6 text-[12px] text-muted" style={{ borderColor: "var(--grid)" }}>
            Data: KKBox Churn Prediction Challenge (WSDM Cup 2018), aggregated — no member-level data is
            published. Pipeline: DuckDB · dbt · scikit-learn · Next.js.{" "}
            <a className="link" href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
