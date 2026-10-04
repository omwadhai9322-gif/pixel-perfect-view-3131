import { supabase } from "@/integrations/supabase/client";

export type Floor = { id: string; name: string; sort_order: number };
export type Room = { id: string; floor_id: string; name: string; sort_order: number };
export type Booking = {
  id: string;
  room_id: string;
  customer_id: string;
  check_in: string;
  check_out: string;
  status: "active" | "cancelled";
  created_at: string;
  customers: { id: string; name: string; phone: string } | null;
  booking_members: Member[];
};
export type Member = { id?: string; name: string; phone: string; position: number };

export type BoardData = { floors: Floor[]; rooms: Room[]; bookings: Booking[] };

export async function fetchBoard(): Promise<BoardData> {
  const [f, r, b] = await Promise.all([
    supabase.from("floors").select("id,name,sort_order").order("sort_order").order("created_at"),
    supabase.from("rooms").select("id,floor_id,name,sort_order").order("sort_order").order("created_at"),
    supabase
      .from("bookings")
      .select("id,room_id,customer_id,check_in,check_out,status,created_at,customers(id,name,phone),booking_members(id,name,phone,position)")
      .order("check_in", { ascending: false }),
  ]);
  if (f.error) throw f.error;
  if (r.error) throw r.error;
  if (b.error) throw b.error;
  const bookings = (b.data as unknown as Booking[]).map((x) => ({
    ...x,
    booking_members: [...(x.booking_members ?? [])].sort((a, c) => a.position - c.position),
  }));
  return { floors: f.data, rooms: r.data, bookings };
}

export function currentBooking(bookings: Booking[], roomId: string, now = Date.now()) {
  return bookings.find(
    (b) =>
      b.room_id === roomId &&
      b.status === "active" &&
      new Date(b.check_in).getTime() <= now &&
      new Date(b.check_out).getTime() > now,
  );
}

export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23P01") return "This room is already booked for part of that period.";
  if (err?.code === "23514") return "Check-out must be after check-in.";
  return err?.message ?? "Something went wrong";
}

export function toLocalInput(iso: string | Date) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
export function fmtFull(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
