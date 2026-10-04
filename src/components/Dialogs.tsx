import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type Booking,
  type BoardData,
  type Floor,
  type Room,
  currentBooking,
  fmtFull,
  friendlyError,
  toLocalInput,
} from "@/lib/rooms";

const btnPrimary =
  "flex-1 rounded-md bg-primary py-2 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-accent disabled:opacity-50";
const btnGhost =
  "flex-1 rounded-md border border-border py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:border-accent";
const btnDanger =
  "flex-1 rounded-md border border-book py-2 font-mono text-xs uppercase tracking-wide text-book hover:bg-book/10";

function Shell({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm font-bold uppercase tracking-[0.12em]">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Booking form (create / edit) ---------- */
function BookingForm({
  roomId,
  booking,
  onDone,
  onCancel,
}: {
  roomId: string;
  booking?: Booking;
  onDone: () => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const initialMembers = (): { name: string; phone: string }[] => {
    const m = booking?.booking_members?.map((x) => ({ name: x.name, phone: x.phone })) ?? [];
    if (!m.length && booking?.customers) m.push({ name: booking.customers.name, phone: booking.customers.phone });
    while (m.length < 2) m.push({ name: "", phone: "" });
    return m.slice(0, 4);
  };
  const [members, setMembers] = useState(initialMembers);
  const [checkIn, setCheckIn] = useState(toLocalInput(booking?.check_in ?? now));
  const [checkOut, setCheckOut] = useState(toLocalInput(booking?.check_out ?? tomorrow));
  const [busy, setBusy] = useState(false);

  const setMember = (i: number, k: "name" | "phone", v: string) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  async function saveMembers(bookingId: string) {
    const del = await supabase.from("booking_members").delete().eq("booking_id", bookingId);
    if (del.error) throw del.error;
    const ins = await supabase.from("booking_members").insert(
      members.map((m, i) => ({ booking_id: bookingId, name: m.name.trim(), phone: m.phone.trim(), position: i + 1 })),
    );
    if (ins.error) throw ins.error;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    if (!(co > ci)) { toast.error("Check-out must be after check-in."); return; }
    if (members.length < 2 || members.length > 4) { toast.error("A room needs 2 to 4 members."); return; }
    for (const [i, m] of members.entries()) {
      if (!m.name.trim()) { toast.error(`Enter a name for member ${i + 1}.`); return; }
      if (!/^[+\d][\d\s-]{5,}$/.test(m.phone.trim())) { toast.error(`Enter a valid contact number for member ${i + 1}.`); return; }
    }
    const name = members[0].name;
    const phone = members[0].phone;
    setBusy(true);
    try {
      if (booking) {
        const c = await supabase.from("customers").update({ name: name.trim(), phone: phone.trim() }).eq("id", booking.customer_id);
        if (c.error) throw c.error;
        const b = await supabase
          .from("bookings")
          .update({ check_in: ci.toISOString(), check_out: co.toISOString() })
          .eq("id", booking.id);
        if (b.error) throw b.error;
        await saveMembers(booking.id);
        toast.success("Booking updated");
      } else {
        const c = await supabase.from("customers").insert({ name: name.trim(), phone: phone.trim() }).select("id").single();
        if (c.error) throw c.error;
        const b = await supabase
          .from("bookings")
          .insert({ room_id: roomId, customer_id: c.data.id, check_in: ci.toISOString(), check_out: co.toISOString() })
          .select("id")
          .single();
        if (b.error) {
          await supabase.from("customers").delete().eq("id", c.data.id);
          throw b.error;
        }
        await saveMembers(b.data.id);
        toast.success("Room booked");
      }
      onDone();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="label-mono">Members ({members.length}/4)</label>
          {members.length < 4 && (
            <button type="button" onClick={() => setMembers((ms) => [...ms, { name: "", phone: "" }])} className="font-mono text-[10px] uppercase tracking-wide text-accent hover:underline">
              + Add member
            </button>
          )}
        </div>
        {members.map((m, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="label-mono">Member {i + 1}{i === 0 ? " (primary)" : ""}</span>
              {members.length > 2 && (
                <button type="button" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))} className="font-mono text-[10px] uppercase text-book hover:underline">
                  Remove
                </button>
              )}
            </div>
            <input className="field" required placeholder="Name" value={m.name} onChange={(e) => setMember(i, "name", e.target.value)} />
            <input className="field font-mono" required type="tel" placeholder="Contact number" value={m.phone} onChange={(e) => setMember(i, "phone", e.target.value)} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label-mono mb-1 block">Check-in</label>
          <input className="field font-mono text-xs" type="datetime-local" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div>
          <label className="label-mono mb-1 block">Check-out</label>
          <input className="field font-mono text-xs" type="datetime-local" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className={btnGhost}>Back</button>
        <button disabled={busy} className={btnPrimary}>{booking ? "Save changes" : "Confirm booking"}</button>
      </div>
    </form>
  );
}

export async function cancelBooking(id: string) {
  const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

export async function deleteBooking(id: string) {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Room dialog ---------- */
export function RoomDialog({
  room,
  data,
  onClose,
  onChanged,
}: {
  room: Room | null;
  data: BoardData;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [view, setView] = useState<"main" | "new" | "edit" | "rename">("main");
  const [editing, setEditing] = useState<Booking | undefined>();
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (room) {
      const cur = currentBooking(data.bookings, room.id);
      setView(cur ? "main" : "new");
      setNewName(room.name);
      setEditing(undefined);
    }
  }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!room) return null;
  const cur = currentBooking(data.bookings, room.id);
  const upcoming = data.bookings
    .filter((b) => b.room_id === room.id && b.status === "active" && new Date(b.check_in).getTime() > Date.now())
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  async function rename() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("rooms").update({ name: newName.trim() }).eq("id", room!.id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Room renamed");
    onChanged();
    setView(cur ? "main" : "new");
  }

  async function doCancel(b: Booking) {
    if (!confirm(`Cancel booking for ${b.customers?.name}?`)) return;
    try {
      await cancelBooking(b.id);
      toast.success("Booking cancelled");
      onChanged();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function doDelete(b: Booking) {
    if (!confirm(`Permanently delete the booking for ${b.customers?.name}? This cannot be undone.`)) return;
    try {
      await deleteBooking(b.id);
      toast.success("Booking deleted");
      onChanged();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const done = () => {
    onChanged();
    onClose();
  };

  return (
    <Shell open={!!room} onClose={onClose} title={`Room ${room.name}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-2 font-mono text-xs ${cur ? "text-book" : "text-avail"}`}>
          <span className={`size-2 rounded-full ${cur ? "bg-book" : "bg-avail"}`} />
          {cur ? "BOOKED" : "AVAILABLE"}
        </span>
        <button onClick={() => setView("rename")} className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-accent">
          Rename room
        </button>
      </div>

      {view === "rename" && (
        <div className="space-y-3">
          <label className="label-mono block">Room number / name</label>
          <input className="field font-mono" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setView(cur ? "main" : "new")} className={btnGhost}>Back</button>
            <button onClick={rename} className={btnPrimary}>Save</button>
          </div>
        </div>
      )}

      {view === "new" && (
        <BookingForm roomId={room.id} onDone={done} onCancel={() => (cur || upcoming.length ? setView("main") : onClose())} />
      )}

      {view === "edit" && editing && (
        <BookingForm roomId={room.id} booking={editing} onDone={done} onCancel={() => setView("main")} />
      )}

      {view === "main" && (
        <div className="space-y-4">
          {cur && (
            <div className="rounded-md border border-book bg-book/10 p-3 space-y-1">
              <p className="font-semibold">{cur.customers?.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{cur.customers?.phone}</p>
              <p className="font-mono text-xs">{fmtFull(cur.check_in)} → {fmtFull(cur.check_out)}</p>
              <div className="flex gap-2 pt-2">
                <button className={btnGhost} onClick={() => { setEditing(cur); setView("edit"); }}>Edit</button>
                <button className={btnGhost} onClick={() => doCancel(cur)}>Cancel booking</button>
                <button className={btnDanger} onClick={() => doDelete(cur)}>Delete</button>
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="label-mono">Upcoming</p>
              {upcoming.map((b) => (
                <div key={b.id} className="rounded-md border border-border p-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{b.customers?.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{b.customers?.phone}</span>
                  </div>
                  <p className="font-mono text-[11px]">{fmtFull(b.check_in)} → {fmtFull(b.check_out)}</p>
                  <div className="mt-2 flex gap-2">
                    <button className={btnGhost} onClick={() => { setEditing(b); setView("edit"); }}>Edit</button>
                    <button className={btnGhost} onClick={() => doCancel(b)}>Cancel</button>
                    <button className={btnDanger} onClick={() => doDelete(b)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className={`${btnPrimary} w-full`} onClick={() => setView("new")}>
            + {cur ? "Book a future period" : "New booking"}
          </button>
        </div>
      )}
    </Shell>
  );
}

/* ---------- Floor dialog ---------- */
export function FloorDialog({
  open,
  floor,
  data,
  onClose,
  onChanged,
}: {
  open: boolean;
  floor: Floor | null;
  data: BoardData;
  onClose: () => void;
  onChanged: () => void;
}) {
  const floorRooms = floor ? data.rooms.filter((r) => r.floor_id === floor.id) : [];
  const nextIndex = data.floors.length + 1;
  const [name, setName] = useState("");
  const [count, setCount] = useState(8);
  const [start, setStart] = useState(101);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (floor) {
      setName(floor.name);
      setCount(0);
      const nums = floorRooms.map((r) => parseInt(r.name, 10)).filter((n) => !isNaN(n));
      setStart(nums.length ? Math.max(...nums) + 1 : (data.floors.indexOf(floor) + 1) * 100 + 1);
    } else {
      setName(`Floor ${nextIndex}`);
      setCount(8);
      setStart(nextIndex * 100 + 1);
    }
  }, [open, floor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (count < 0 || count > 200) { toast.error("Room count must be between 0 and 200."); return; }
    setBusy(true);
    try {
      let floorId = floor?.id;
      if (floor) {
        const { error } = await supabase.from("floors").update({ name: name.trim() }).eq("id", floor.id);
        if (error) throw error;
      } else {
        const maxOrder = Math.max(0, ...data.floors.map((f) => f.sort_order));
        const { data: f, error } = await supabase
          .from("floors")
          .insert({ name: name.trim(), sort_order: maxOrder + 1 })
          .select("id")
          .single();
        if (error) throw error;
        floorId = f.id;
      }
      if (count > 0 && floorId) {
        const baseOrder = Math.max(0, ...floorRooms.map((r) => r.sort_order));
        const rows = Array.from({ length: count }, (_, i) => ({
          floor_id: floorId!,
          name: String(start + i),
          sort_order: baseOrder + i + 1,
        }));
        const { error } = await supabase.from("rooms").insert(rows);
        if (error) throw error;
      }
      toast.success(floor ? "Floor updated" : `Floor added with ${count} rooms`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!floor) return;
    const ids = new Set(floorRooms.map((r) => r.id));
    const live = data.bookings.filter(
      (b) => ids.has(b.room_id) && b.status === "active" && new Date(b.check_out).getTime() > Date.now(),
    );
    if (live.length) {
      { toast.error(`This floor has ${live.length} current or upcoming booking(s). Cancel them first.`); return; }
    }
    if (!confirm(`Delete ${floor.name} and its ${floorRooms.length} rooms? Past booking history for these rooms will also be removed.`)) return;
    const { error } = await supabase.from("floors").delete().eq("id", floor.id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Floor removed");
    onChanged();
    onClose();
  }

  return (
    <Shell open={open} onClose={onClose} title={floor ? `Edit ${floor.name}` : "Add floor"}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label-mono mb-1 block">Floor name</label>
          <input className="field" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-mono mb-1 block">{floor ? "Add more rooms" : "Number of rooms"}</label>
            <input className="field font-mono" type="number" min={0} max={200} value={count} onChange={(e) => setCount(parseInt(e.target.value || "0", 10))} />
          </div>
          <div>
            <label className="label-mono mb-1 block">Start numbering at</label>
            <input className="field font-mono" type="number" value={start} onChange={(e) => setStart(parseInt(e.target.value || "0", 10))} />
          </div>
        </div>
        {count > 0 && (
          <p className="font-mono text-xs text-muted-foreground">
            Will create rooms {start} – {start + count - 1}
          </p>
        )}
        {floor && <p className="font-mono text-xs text-muted-foreground">Currently {floorRooms.length} rooms on this floor.</p>}
        <div className="flex gap-2">
          {floor && <button type="button" onClick={remove} className={btnDanger}>Delete floor</button>}
          <button disabled={busy} className={btnPrimary}>{floor ? "Save" : "Create floor"}</button>
        </div>
      </form>
      {floor && floorRooms.length > 0 && <RoomRemover rooms={floorRooms} data={data} onChanged={onChanged} />}
    </Shell>
  );
}

function RoomRemover({ rooms, data, onChanged }: { rooms: Room[]; data: BoardData; onChanged: () => void }) {
  async function del(r: Room) {
    const live = data.bookings.some(
      (b) => b.room_id === r.id && b.status === "active" && new Date(b.check_out).getTime() > Date.now(),
    );
    if (live) { toast.error(`Room ${r.name} has current or upcoming bookings.`); return; }
    if (!confirm(`Remove room ${r.name}?`)) return;
    const { error } = await supabase.from("rooms").delete().eq("id", r.id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Room ${r.name} removed`);
    onChanged();
  }
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="label-mono">Remove a room</p>
      <div className="flex flex-wrap gap-1.5">
        {rooms.map((r) => (
          <button key={r.id} onClick={() => del(r)} className="rounded-md border border-border px-2 py-1 font-mono text-[11px] hover:border-book hover:text-book">
            {r.name} ×
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- History ---------- */
export function HistoryDialog({
  open,
  data,
  onClose,
  onChanged,
}: {
  open: boolean;
  data: BoardData;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? "?";
  const now = Date.now();
  const list = data.bookings.filter((b) => {
    const s = q.toLowerCase();
    return !s || b.customers?.name.toLowerCase().includes(s) || b.customers?.phone.includes(s) || roomName(b.room_id).toLowerCase().includes(s);
  });
  const label = (b: Booking) => {
    if (b.status === "cancelled") return { t: "Cancelled", c: "text-muted-foreground" };
    if (new Date(b.check_out).getTime() <= now) return { t: "Completed", c: "text-muted-foreground" };
    if (new Date(b.check_in).getTime() > now) return { t: "Upcoming", c: "text-accent" };
    return { t: "Staying", c: "text-book" };
  };
  return (
    <Shell open={open} onClose={onClose} title="Booking history">
      <input className="field font-mono text-xs" placeholder="Search customer, phone, room…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2">
        {list.length === 0 && <p className="font-mono text-xs text-muted-foreground">No bookings yet.</p>}
        {list.map((b) => {
          const l = label(b);
          const live = b.status === "active" && new Date(b.check_out).getTime() > now;
          return (
            <div key={b.id} className="rounded-md border border-border p-2 text-sm">
              <div className="flex justify-between gap-2">
                <span><span className="font-mono font-bold">{roomName(b.room_id)}</span> · <span className="font-semibold">{b.customers?.name}</span></span>
                <span className={`font-mono text-[10px] uppercase ${l.c}`}>{l.t}</span>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">{b.customers?.phone}</p>
              <p className="font-mono text-[11px]">{fmtFull(b.check_in)} → {fmtFull(b.check_out)}</p>
              <div className="mt-1 flex gap-3">
                {live && (
                  <button
                    className="font-mono text-[10px] uppercase text-book hover:underline"
                    onClick={async () => {
                      if (!confirm("Cancel this booking?")) return;
                      try { await cancelBooking(b.id); toast.success("Booking cancelled"); onChanged(); } catch (e) { toast.error(friendlyError(e)); }
                    }}
                  >
                    Cancel booking
                  </button>
                )}
                <button
                  className="font-mono text-[10px] uppercase text-book hover:underline"
                  onClick={async () => {
                    if (!confirm("Permanently delete this booking? This cannot be undone.")) return;
                    try { await deleteBooking(b.id); toast.success("Booking deleted"); onChanged(); } catch (e) { toast.error(friendlyError(e)); }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
