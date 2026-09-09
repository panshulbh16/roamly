"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  History,
  ArrowRight,
  Search,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { HistoryEntry } from "@/lib/history/types";
export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  async function load(offset = 0) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/history?offset=" + offset);
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setEntries((v) => (offset ? [...v, ...data.entries] : data.entries));
      setMore(data.hasMore);
      setPage(offset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, []);
  async function remove(id: string) {
    try {
      const r = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
          <h1 style={{ marginTop: 12 }}>Your search history</h1>
          <p className="subtext">
            Every submitted trip search, saved automatically to your account.
          </p>
        </div>
        <Link className="primary" href="/">
          Plan a trip <ArrowRight size={16} />
        </Link>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
          <button className="text-button" onClick={() => load()}>
            Try again
          </button>
        </div>
      )}
      {busy && !entries.length ? (
        <p role="status">
          <LoaderCircle className="loading-spin" size={18} />
          Loading history…
        </p>
      ) : !entries.length && !error ? (
        <section className="empty-state">
          <History size={42} />
          <h2>Your travel story starts here.</h2>
          <p className="subtext">
            Search for Auckland, Austria, or anywhere on your mind.
            <br />
            You can come back to each search here.
          </p>
          <Link href="/" className="primary" style={{ width: "fit-content" }}>
            Plan a trip
          </Link>
        </section>
      ) : (
        <div className="history-list">
          {entries.map((entry) => (
            <article className="panel history-row" key={entry.id}>
              <div className="icon-box">
                <Search size={18} />
              </div>
              <div className="history-content">
                <h2>{entry.intake.destination}</h2>
                <p className="subtext">
                  {entry.intake.days} days · {entry.intake.travelers} travelers
                  · {entry.intake.budget} · {entry.intake.pace}
                </p>
                <p className="history-meta">
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  <span>
                    {entry.status === "completed"
                      ? "Itinerary ready"
                      : entry.status === "failed"
                        ? "Search saved · itinerary unavailable"
                        : "Search saved · generation not yet complete"}
                  </span>
                </p>
                {entry.status === "failed" && (
                  <p className="history-error">{entry.error}</p>
                )}
              </div>
              <div className="history-actions">
                <Link
                  className="secondary-button"
                  href={"/?history=" + encodeURIComponent(entry.id)}
                >
                  {entry.trip ? "Open itinerary" : "Reopen search"}
                  <ArrowRight size={15} />
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="secondary-button"
                      aria-label={
                        "Delete search for " + entry.intake.destination
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>Delete this search?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes this search and its generated result from
                      History. Trips saved separately in My trips are kept.
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep search</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(entry.id)}>
                        Delete search
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </article>
          ))}
        </div>
      )}
      {more && (
        <button
          className="secondary-button"
          style={{ marginTop: 20 }}
          disabled={busy}
          onClick={() => load(page + 20)}
        >
          {busy ? "Loading…" : "Load older searches"}
        </button>
      )}
    </main>
  );
}
