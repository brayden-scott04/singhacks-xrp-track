import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HistoryDashboard } from "@/components/history/HistoryDashboard";

const TAGLINE =
  "Every task the agent has run, kept across restarts: what was asked, which agent won it and why, what it cost, and what settled on-chain.";

export default function HistoryPage() {
  return (
    <>
      <header className="app-head">
        <div className="app-head-main">
          <h1>Task history</h1>
          <p className="tagline">{TAGLINE}</p>
        </div>
        <div className="app-head-actions">
          <Link className="btn-ghost" href="/">
            Live dashboard
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main id="main">
        <HistoryDashboard />
      </main>
    </>
  );
}
