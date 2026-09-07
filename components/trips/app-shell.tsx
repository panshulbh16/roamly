"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Sparkles,
  Map,
  Bookmark,
  ArrowUpRight,
  HelpCircle,
  Leaf,
  ChevronDown,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function AppShell({
  children,
  name,
}: {
  children: React.ReactNode;
  name: string;
}) {
  const path = usePathname();
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "225px" } as React.CSSProperties}
    >
      <Sidebar>
        <div className="shell-side">
          <Link href="/" className="brand">
            <Compass strokeWidth={2.3} />
            roamly<span style={{ color: "#70a588" }}>.</span>
          </Link>
          <nav className="nav-group">
            {[
              { href: "/", icon: Sparkles, label: "Plan a trip" },
              { href: "/trips", icon: Map, label: "My trips" },
              { href: "/explore", icon: Compass, label: "Explore" },
            ].map((n) => (
              <Link
                className={path === n.href ? "active" : ""}
                key={n.href}
                href={n.href}
              >
                <n.icon />
                {n.label}
              </Link>
            ))}
          </nav>
          <p className="side-label">YOUR NEXT CHAPTER</p>
          <Link
            href="/explore"
            className="text-button"
            style={{ padding: "4px 15px", gap: 12, color: "#78827d" }}
          >
            <Bookmark size={17} />
            Find a little inspiration
          </Link>
          <div className="side-tip">
            <Leaf size={20} />
            <strong>Less planning. More living.</strong>
            <p>A thoughtful trip starts with what you love.</p>
            <Link href="/pricing" className="secondary-button">
              Discover Roamly Plus <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="account">
            <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>
                {name.includes("@") ? "Your account" : name.split(" ")[0]}
              </strong>
              <div style={{ color: "#939b95", fontSize: 11, marginTop: 3 }}>
                Early access
              </div>
            </div>
            <ChevronDown size={14} style={{ marginLeft: "auto" }} />
          </div>
        </div>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SidebarTrigger className="md:hidden" />
            <span className="topbar-label">
              Your next adventure starts here
            </span>
            <Link href="/" className="brand mobile-brand">
              roamly.
            </Link>
          </div>
          <div className="top-actions">
            <Dialog>
              <DialogTrigger asChild>
                <button aria-label="How Roamly works">
                  <HelpCircle size={16} />
                  <span className="hidden sm:inline">How it works</span>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>A thoughtful trip, in a few steps</DialogTitle>
                <DialogDescription>
                  Tell us where you want to go, your pace, and what you love.
                  Generate a personal itinerary, edit the activities, and save
                  it to My trips. AI planning is available when the service is
                  connected. Explore the labeled Kyoto example now. Always
                  verify travel conditions and booking details before departure.
                </DialogDescription>
              </DialogContent>
            </Dialog>
            <Link href="/pricing" className="text-button">
              <Sparkles size={15} />
              Roamly Plus
            </Link>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
