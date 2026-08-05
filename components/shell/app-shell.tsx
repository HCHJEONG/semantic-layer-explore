import { Braces, LayoutDashboard, Network, ScrollText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type AppTab = "dashboard" | "explorer" | "rules" | "ai";

const tabs: Array<{ id: AppTab; label: string; icon: typeof Braces }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "explorer", label: "Explorer", icon: Braces },
  { id: "rules", label: "Rules", icon: ScrollText },
  { id: "ai", label: "Ask AI", icon: Sparkles },
];

export function AppShell({ tab, onTabChange, children }: { tab: AppTab; onTabChange: (tab: AppTab) => void; children: ReactNode }) {
  return <main>
    <header className="topbar">
      <div className="brand"><div className="brandmark"><Network size={18} /></div><div><strong>Semantic Layer</strong><span>Explorer</span></div></div>
      <nav aria-label="Primary navigation">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <Button key={item.id} variant={tab === item.id ? "secondary" : "ghost"} size="sm" onClick={() => onTabChange(item.id)}><Icon size={15} /> {item.label}</Button>;
        })}
      </nav>
      <div className="status"><i /> SQLite connected</div>
    </header>
    {children}
  </main>;
}