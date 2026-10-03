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
  if (error || !data) return <div className="grid min-h-screen place-items-center font-mono text-sm text-book">Could not load data.</div>;

  const s = q.trim().toLowerCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="mr-2 flex items-center gap-2">
            <span className="inline-block size-3 rounded-full bg-accent" />
            <span className="font-mono text-lg font-bold tracking-tight">ROOMBOARD</span>
            <span className="label-mono hidden sm:inline">live ops</span>
          </div>
          <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">⌕</span>
            <input className="field py-1.5 pl-8 font-mono text-xs" placeholder="Search room or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ml-auto flex gap-2 sm:ml-0">
            <button onClick={() => setHistory(true)} className="rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-wide hover:border-accent">History</button>
            <button onClick={() => setFloorDlg({ open: true, floor: null })} className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-accent">+ Add floor</button>
            <button onClick={() => supabase.auth.signOut()} className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground">Sign out</button>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="grid grid-cols-2 md:grid-cols-4">
          <Stat label="Total rooms" value={stats.total} />
          <Stat label="Available" value={stats.total - stats.booked} tone="text-avail" />
          <Stat label="Booked" value={stats.booked} tone="text-book" />
          <Stat label="Floors" value={data.floors.length} last />
        </div>
      </section>

      <main className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-mono">Filter</span>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          <Chip active={filter === "avail"} tone="avail" onClick={() => setFilter("avail")}>Available</Chip>
          <Chip active={filter === "booked"} tone="book" onClick={() => setFilter("booked")}>Booked</Chip>
          {data.floors.length > 1 && (
            <>
              <span className="label-mono ml-3">Floor</span>
              <Chip active={!floorFilter} onClick={() => setFloorFilter(null)}>All</Chip>
              {data.floors.map((f) => (
                <Chip key={f.id} active={floorFilter === f.id} onClick={() => setFloorFilter(f.id)}>{f.name}</Chip>
              ))}
            </>
          )}
        </div>

        {data.floors.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="font-mono text-sm font-bold">No floors yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a floor and enter how many rooms it has — the room boxes are created for you.</p>
            <button onClick={() => setFloorDlg({ open: true, floor: null })} className="mt-4 rounded-md bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-accent">+ Add first floor</button>
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
                  (x.customers?.name.toLowerCase().includes(s) || x.customers?.phone.includes(s)),
              );
              return r.name.toLowerCase().includes(s) || custMatch;
            });
            if ((s || filter !== "all") && shown.length === 0) return null;
            return (
              <div key={f.id}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold">{f.name}</span>
                  <span className="label-mono">{all.length} rooms · {free} free</span>
                  <button onClick={() => setFloorDlg({ open: true, floor: f })} className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-accent">Edit floor</button>
                </div>
                {all.length === 0 ? (
                  <p className="font-mono text-xs text-muted-foreground">No rooms — use Edit floor to add some.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
                    {shown.map((r) => {
                      const b = currentBooking(data.bookings, r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => setRoom(r)}
                          className={`flex h-[92px] flex-col justify-between rounded-md border p-2 text-left transition-colors ${
                            b ? "border-book bg-book/10 hover:bg-book/20" : "border-avail bg-avail/10 hover:bg-avail/20"
                          }`}
                        >
                          <div className="flex w-full justify-between">
                            <span className="font-mono text-xs font-bold">{r.name}</span>
                            <span className={`size-2 rounded-full ${b ? "bg-book" : "bg-avail"}`} />
                          </div>
                          {b ? (
                            <div className="w-full min-w-0">
                              <p className="truncate text-[11px] font-semibold leading-tight">{b.customers?.name}</p>
                              <p className="font-mono text-[9px] text-muted-foreground">{fmtShort(b.check_in)}–{fmtShort(b.check_out)}</p>
                            </div>
                          ) : (
                            <span className="font-mono text-[10px] uppercase text-avail">Free</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </main>

      <RoomDialog room={room} data={data} onClose={() => setRoom(null)} onChanged={refresh} />
      <FloorDialog open={floorDlg.open} floor={floorDlg.floor} data={data} onClose={() => setFloorDlg({ open: false, floor: null })} onChanged={refresh} />
      <HistoryDialog open={history} data={data} onClose={() => setHistory(false)} onChanged={refresh} />
    </div>
  );
}

function Stat({ label, value, tone = "", last }: { label: string; value: number; tone?: string; last?: boolean }) {
  return (
    <div className={`border-b border-border px-5 py-4 md:border-b-0 ${last ? "" : "md:border-r"}`}>
      <p className="label-mono">{label}</p>
      <p className={`mt-1 font-mono text-4xl font-bold leading-none ${tone}`}>{value}</p>
    </div>
  );
}

function Chip({ active, tone, onClick, children }: { active: boolean; tone?: "avail" | "book"; onClick: () => void; children: React.ReactNode }) {
  const toneCls = tone === "avail" ? "border-avail text-avail" : tone === "book" ? "border-book text-book" : "border-border";
  return (
    <button onClick={onClick} className={`rounded-md border px-3 py-1 font-mono text-xs ${toneCls} ${active ? "bg-foreground/10 font-bold" : "hover:border-accent"}`}>
      {children}
    </button>
  );
}
