import { Braces, LayoutDashboard, Network, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type AppTab = "dashboard" | "explorer" | "ai";

export function AppShell({ tab, onTabChange, children }: { tab: AppTab; onTabChange: (tab: AppTab) => void; children: ReactNode }) {
  return <main>
    <header className="topbar">
      <div className="brand"><div className="brandmark"><Network size={18} /></div><div><strong>Semantic Layer</strong><span>Explorer</span></div></div>
      <nav aria-label="Primary navigation">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => onTabChange("dashboard")}><LayoutDashboard size={15} /> Dashboard</button>
        <button className={tab === "explorer" ? "active" : ""} onClick={() => onTabChange("explorer")}><Braces size={15} /> Explorer</button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => onTabChange("ai")}><Sparkles size={15} /> Ask AI</button>
      </nav>
      <div className="status"><i /> SQLite connected</div>
    </header>
    {children}
  </main>;
}
