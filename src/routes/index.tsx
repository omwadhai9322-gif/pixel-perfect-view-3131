import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/AuthForm";
import { FloorDialog, HistoryDialog, RoomDialog } from "@/components/Dialogs";
import { type Floor, type Room, currentBooking, fetchBoard, fmtShort } from "@/lib/rooms";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RoomBoard — PG & Hotel Room Manager" },
      { name: "description", content: "Manage floors, rooms and bookings for your PG or hotel at a glance." },
      { property: "og:title", content: "RoomBoard — PG & Hotel Room Manager" },
      { property: "og:description", content: "Manage floors, rooms and bookings for your PG or hotel at a glance." },
    ],
  }),
  component: Index,
});

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="grid min-h-screen place-items-center label-mono">Loading…</div>;
  if (!session) return <AuthForm />;
  return <Board />;
}

type Filter = "all" | "avail" | "booked";

function Board() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["board"], queryFn: fetchBoard, refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["board"] });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [floorFilter, setFloorFilter] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [floorDlg, setFloorDlg] = useState<{ open: boolean; floor: Floor | null }>({ open: false, floor: null });
  const [history, setHistory] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    if (!data) return { total: 0, booked: 0 };
    const booked = data.rooms.filter((r) => currentBooking(data.bookings, r.id)).length;
    return { total: data.rooms.length, booked };
  }, [data]);

  if (isLoading) return <div className="grid min-h-screen place-items-center label-mono">Loading rooms…</div>;
  if (error || !data) return <div className="grid min-h-screen place-items-center text-sm font-medium text-book">Could not load data.</div>;

  const s = q.trim().toLowerCase();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary shadow-sm">
              <div className="size-4 rounded-[4px] bg-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">RoomBoard</h1>
              <p className="text-[11px] font-medium text-muted-foreground">Live room status</p>
            </div>
          </div>
          <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-64">
            <svg className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="w-full rounded-full border border-transparent bg-muted py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent focus:bg-card"
              placeholder="Search room or customer…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <button
              onClick={() => setHistory(true)}
              className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              History
            </button>
            <button
              onClick={() => setFloorDlg({ open: true, floor: null })}
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90"
            >
              + Add floor
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total rooms" value={stats.total} />
          <Stat label="Available" value={stats.total - stats.booked} kind="avail" />
          <Stat label="Booked" value={stats.booked} kind="book" />
          <Stat label="Floors" value={data.floors.length} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All rooms</Chip>
          <Chip active={filter === "avail"} tone="avail" onClick={() => setFilter("avail")}>Available</Chip>
          <Chip active={filter === "booked"} tone="book" onClick={() => setFilter("booked")}>Booked</Chip>
          {data.floors.length > 1 && (
            <>
              <div className="mx-1 h-5 w-px bg-border" />
              <Chip active={!floorFilter} onClick={() => setFloorFilter(null)}>All floors</Chip>
              {data.floors.map((f) => (
                <Chip key={f.id} active={floorFilter === f.id} onClick={() => setFloorFilter(f.id)}>{f.name}</Chip>
              ))}
            </>
          )}
        </div>

        {data.floors.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
            <p className="text-base font-bold">No floors yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a floor and enter how many rooms it has — the room cards are created for you.</p>
            <button
              onClick={() => setFloorDlg({ open: true, floor: null })}
              className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90"
            >
              + Add first floor
            </button>
          </div>
        )}

        {data.floors
          .filter((f) => !floorFilter || f.id === floorFilter)
          .map((f) => {
            const all = data.rooms.filter((r) => r.floor_id === f.id);
            const free = all.filter((r) => !currentBooking(data.bookings, r.id)).length;
            const shown = all.filter((r) => {
              const b = currentBooking(data.bookings, r.id);
              if (filter === "avail" && b) return false;
              if (filter === "booked" && !b) return false;
              if (!s) return true;
              const custMatch = data.bookings.some(
                (x) => x.room_id === r.id && x.status === "active" && new Date(x.check_out).getTime() > Date.now() &&
                  (x.customers?.name.toLowerCase().includes(s) || x.customers?.phone.includes(s) ||
                    x.booking_members.some((m) => m.name.toLowerCase().includes(s) || m.phone.includes(s))),
              );
              return r.name.toLowerCase().includes(s) || custMatch;
            });
            if ((s || filter !== "all") && shown.length === 0) return null;
            return (
              <section key={f.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="text-base font-bold tracking-tight">{f.name}</h2>
                  <span className="text-xs font-medium text-muted-foreground">{all.length} rooms · {free} free</span>
                  <button
                    onClick={() => setFloorDlg({ open: true, floor: f })}
                    className="ml-auto text-xs font-semibold text-muted-foreground transition-colors hover:text-accent"
                  >
                    Edit floor
                  </button>
                </div>
                {all.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rooms — use Edit floor to add some.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {shown.map((r) => {
                      const b = currentBooking(data.bookings, r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => setRoom(r)}
                          className={`group relative rounded-2xl border-2 p-4 text-center transition-all hover:-translate-y-1 hover:shadow-lg ${
                            b
                              ? "border-book-soft bg-book-soft/50 shadow-inner hover:border-book"
                              : "border-transparent bg-background shadow-sm hover:border-avail"
                          }`}
                        >
                          <span className={`absolute right-3 top-3 size-2 rounded-full ${b ? "bg-book" : "bg-avail"}`} />
                          <h3 className="text-xl font-bold text-foreground">{r.name}</h3>
                          {b ? (
                            <div className="mt-2 space-y-0.5">
                              {(b.booking_members.length ? b.booking_members.map((m) => m.name) : [b.customers?.name ?? ""]).map((n, i) => (
                                <p key={i} className="truncate text-xs font-semibold text-foreground">{n}</p>
                              ))}
                              <p className="text-[10px] font-medium text-muted-foreground">{fmtShort(b.check_in)} – {fmtShort(b.check_out)}</p>
                              <p className="mx-auto mt-1 w-fit rounded bg-book-soft px-2 py-0.5 text-[10px] font-bold uppercase text-book">Booked</p>
                            </div>
                          ) : (
                            <p className="mx-auto mt-2 w-fit rounded bg-avail-soft px-2 py-0.5 text-[10px] font-bold uppercase text-avail">Available</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
      </div>

      <RoomDialog room={room} data={data} onClose={() => setRoom(null)} onChanged={refresh} />
      <FloorDialog open={floorDlg.open} floor={floorDlg.floor} data={data} onClose={() => setFloorDlg({ open: false, floor: null })} onChanged={refresh} />
      <HistoryDialog open={history} data={data} onClose={() => setHistory(false)} onChanged={refresh} />
    </div>
  );
}

function Stat({ label, value, kind }: { label: string; value: number; kind?: "avail" | "book" }) {
  const cls =
    kind === "avail"
      ? "border-avail-soft bg-avail-soft/60"
      : kind === "book"
        ? "border-book-soft bg-book-soft/60"
        : "border-border bg-card";
  const numCls = kind === "avail" ? "text-avail" : kind === "book" ? "text-book" : "text-foreground";
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${cls}`}>
      <p className="label-mono">{label}</p>
      <p className={`mt-1 text-3xl font-bold leading-none ${numCls}`}>{value}</p>
    </div>
  );
}

function Chip({ active, tone, onClick, children }: { active: boolean; tone?: "avail" | "book"; onClick: () => void; children: React.ReactNode }) {
  const base = "rounded-full px-4 py-1.5 text-xs font-semibold transition-all";
  const cls = active
    ? tone === "avail"
      ? "bg-avail text-white shadow-sm"
      : tone === "book"
        ? "bg-book text-white shadow-sm"
        : "bg-primary text-primary-foreground shadow-sm"
    : tone === "avail"
      ? "border border-avail/40 bg-card text-avail hover:border-avail"
      : tone === "book"
        ? "border border-book/40 bg-card text-book hover:border-book"
        : "border border-border bg-card text-muted-foreground hover:border-accent hover:text-foreground";
  return (
    <button onClick={onClick} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}
