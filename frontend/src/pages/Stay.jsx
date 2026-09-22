import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BedDouble, Plus, ChevronLeft, ChevronRight, LogIn, LogOut, Ban, IndianRupee, Trash2, Pencil, FileText, Inbox, Globe, Check, X } from "lucide-react";
import PartySelect from "@/components/PartySelect";
import { inr, fmtDate, todayISO } from "@/lib/format";

const DAYS = 14;
// Local-date arithmetic (toISOString would shift IST dates back a day)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const STATUS = {
  booked:      { label: "Booked",      cls: "bg-blue-100 text-blue-700",       bar: "bg-blue-500" },
  checked_in:  { label: "In house",    cls: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-600" },
  checked_out: { label: "Checked out", cls: "bg-slate-100 text-slate-600",     bar: "bg-slate-400" },
  cancelled:   { label: "Cancelled",   cls: "bg-rose-50 text-rose-500",        bar: "bg-rose-300" },
};
const CHANNELS = ["Direct", "Walk-in", "Phone", "Website", "Airbnb", "Booking.com", "MakeMyTrip", "Goibibo", "Agoda", "Expedia", "TripAdvisor", "Other"];
const errMsg = (e, d) => e?.response?.data?.detail || d;

export default function Stay() {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [start, setStart] = useState(todayISO());
  const [bookingForm, setBookingForm] = useState(null);   // new/edit booking
  const [openBooking, setOpenBooking] = useState(null);   // booking detail
  const [roomForm, setRoomForm] = useState(null);
  const [inbox, setInbox] = useState([]);

  const end = addDays(start, DAYS);
  const load = async () => {
    const [r, b] = await Promise.all([
      api.get("/stay/rooms"),
      api.get("/stay/bookings", { params: { date_from: addDays(start, -60), date_to: addDays(end, 60) } }),
    ]);
    setRooms(r.data); setBookings(b.data);
    api.get("/stay/inbox").then(x => setInbox(x.data)).catch(() => {});
    if (openBooking) setOpenBooking(b.data.find(x => x.id === openBooking.id) || null);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [start]);

  const today = todayISO();
  const active = bookings.filter(b => ["booked", "checked_in"].includes(b.status));
  const inHouse = active.filter(b => b.status === "checked_in").length;
  const arrivals = active.filter(b => b.status === "booked" && b.check_in === today).length;
  const departures = active.filter(b => b.status === "checked_in" && b.check_out === today).length;
  const occupiedTonight = new Set(active.filter(b => b.check_in <= today && b.check_out > today).map(b => b.room_id)).size;

  return (
    <div className="space-y-6" data-testid="stay-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2"><BedDouble className="h-7 w-7 text-teal-600" /> Stay & Bookings</h1>
          <p className="text-sm text-muted-foreground mt-1">Rooms, reservations, check-in / check-out. Check-out raises the GST invoice automatically.</p>
        </div>
        <Button onClick={() => rooms.length ? setBookingForm({}) : toast.error("Add your rooms first (Rooms tab)")} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Booking
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Occupied tonight", `${occupiedTonight} / ${rooms.length}`], ["In house", inHouse], ["Arrivals today", arrivals], ["Departures today", departures]].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold mt-1">{v}</p></Card>
        ))}
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Room board</TabsTrigger>
          <TabsTrigger value="list">Bookings</TabsTrigger>
          <TabsTrigger value="inbox" className={inbox.length ? "text-amber-700 font-semibold" : ""}>
            Inbox{inbox.length ? ` (${inbox.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="rooms">Rooms ({rooms.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Button size="icon" variant="outline" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => setStart(todayISO())}>Today</Button>
              <Button size="icon" variant="outline" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground ml-2">{fmtDate(start)} – {fmtDate(addDays(end, -1))}</span>
            </div>
            {rooms.length === 0 ? <EmptyRooms onAdd={() => setRoomForm({})} /> : (
              <Board rooms={rooms} bookings={bookings} start={start}
                onPick={b => setOpenBooking(b)}
                onEmpty={(room, day) => setBookingForm({ room_id: room.id, check_in: day, check_out: addDays(day, 1) })} />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead><tr><th>Booking</th><th>Guest</th><th>Room</th><th>Stay</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Advance</th><th className="text-right">Balance</th></tr></thead>
                <tbody>
                  {bookings.length === 0 ? <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No bookings in this period.</td></tr> :
                    [...bookings].sort((a, b) => b.check_in.localeCompare(a.check_in)).map(b => (
                      <tr key={b.id} className="cursor-pointer" onClick={() => setOpenBooking(b)}>
                        <td className="font-mono-fin text-teal-700 font-medium">{b.booking_no}{b.invoice_no && <div className="text-[11px] text-muted-foreground">{b.invoice_no}</div>}</td>
                        <td className="font-medium">{b.party_snapshot?.name}</td>
                        <td>{b.room_number} <span className="text-xs text-muted-foreground">{b.room_type}</span></td>
                        <td className="text-sm whitespace-nowrap">{fmtDate(b.check_in)} → {fmtDate(b.check_out)} <span className="text-xs text-muted-foreground">({b.nights}n)</span></td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[b.status]?.cls}`}>{STATUS[b.status]?.label}</span></td>
                        <td className="num">{inr(b.estimated_total)}</td>
                        <td className="num">{inr(b.advance_paid)}</td>
                        <td className="num">{b.status === "cancelled" ? "—" : inr(b.balance)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inbox">
          <Card className="p-4">
            <div className="flex items-start gap-2 mb-3">
              <Inbox className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium">Bookings from your website or an OTA that need a room</p>
                <p className="text-sm text-muted-foreground">They arrive here when no free room matched, so nothing is lost. Pick a room to accept.</p>
              </div>
            </div>
            {inbox.length === 0
              ? <p className="text-sm text-muted-foreground py-6 text-center">Nothing waiting. Channel bookings that match a free room are added automatically.</p>
              : <div className="space-y-2">{inbox.map(i => <InboxRow key={i.id} item={i} rooms={rooms} onDone={load} />)}</div>}
          </Card>
        </TabsContent>

        <TabsContent value="rooms">
          <Card>
            <div className="flex justify-end p-3"><Button size="sm" onClick={() => setRoomForm({})}><Plus className="h-4 w-4 mr-1" /> Add room</Button></div>
            {rooms.length === 0 ? <EmptyRooms onAdd={() => setRoomForm({})} /> : (
              <div className="overflow-x-auto">
                <table className="app-table">
                  <thead><tr><th>Room</th><th>Type</th><th>Capacity</th><th className="text-right">Tariff / night</th><th>GST</th><th>Status</th><th></th></tr></thead>
                  <tbody>{rooms.map(r => (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.number}</td><td>{r.room_type}</td><td>{r.capacity}</td>
                      <td className="num">{inr(r.tariff)}</td>
                      <td>{(r.tariff || 0) <= 7500 ? "5%" : "18%"}</td>
                      <td>{r.status === "maintenance" ? <Badge variant="secondary">Maintenance</Badge> : <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Available</Badge>}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => setRoomForm(r)}><Pencil className="h-4 w-4 text-blue-500" /></Button>
                        <Button size="icon" variant="ghost" onClick={async () => {
                          try { await api.delete(`/stay/rooms/${r.id}`); toast.success("Room removed"); load(); } catch (e) { toast.error(errMsg(e, "Failed")); }
                        }}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                      </td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground p-3">GST on rooms (SAC 996311): 5% when the tariff is ₹7,500/night or less, 18% above. You can override the rate on a booking.</p>
          </Card>
        </TabsContent>
      </Tabs>

      <RoomDialog room={roomForm} onClose={() => setRoomForm(null)} onSaved={load} />
      <BookingDialog initial={bookingForm} rooms={rooms} onClose={() => setBookingForm(null)} onSaved={(b) => { load(); setOpenBooking(b); }} />
      <BookingDetail booking={openBooking} onClose={() => setOpenBooking(null)} onChanged={load}
        onEdit={(b) => { setOpenBooking(null); setBookingForm(b); }} />
    </div>
  );
}

function InboxRow({ item, rooms, onDone }) {
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const p = item.payload || {};
  const accept = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/stay/inbox/${item.id}/accept`, { room_id: roomId || undefined });
      toast.success(`Accepted as ${data.booking_no} in room ${data.room}`);
      onDone();
    } catch (e) { toast.error(errMsg(e, "Could not accept")); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><Globe className="h-3 w-3 mr-1" />{item.channel}</Badge>
          <span className="font-medium">{item.guest_name || "Guest"}</span>
          {p.channel_ref && <span className="text-xs text-muted-foreground">{p.channel_ref}</span>}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {fmtDate(item.check_in)} → {fmtDate(item.check_out)} · {p.adults || 1} adult(s)
          {p.room_type ? ` · asked for ${p.room_type}` : ""}
          {p.total_amount ? ` · ${inr(p.total_amount)}` : ""}
        </div>
        <p className="text-xs text-amber-700 mt-1">{item.reason}</p>
      </div>
      <Select value={roomId} onValueChange={setRoomId}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Choose a room" /></SelectTrigger>
        <SelectContent>{rooms.filter(r => r.status !== "maintenance").map(r => (
          <SelectItem key={r.id} value={r.id}>{r.number} · {r.room_type} · {inr(r.tariff)}</SelectItem>))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={busy || !roomId} onClick={accept} className="bg-teal-600 hover:bg-teal-700"><Check className="h-4 w-4 mr-1" />Accept</Button>
      <Button size="sm" variant="ghost" disabled={busy} title="Dismiss"
        onClick={async () => { await api.delete(`/stay/inbox/${item.id}`); toast.success("Dismissed"); onDone(); }}><X className="h-4 w-4" /></Button>
    </div>
  );
}

function EmptyRooms({ onAdd }) {
  return (
    <div className="text-center py-10">
      <BedDouble className="h-8 w-8 text-teal-600 mx-auto mb-2" />
      <p className="font-medium">No rooms yet</p>
      <p className="text-sm text-muted-foreground mb-3">Add your rooms with their nightly tariff to start taking bookings.</p>
      <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add room</Button>
    </div>
  );
}

function Board({ rooms, bookings, start, onPick, onEmpty }) {
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);
  const today = todayISO();
  const visible = bookings.filter(b => b.status !== "cancelled");
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid" style={{ gridTemplateColumns: `90px repeat(${DAYS}, minmax(52px, 1fr))` }}>
          <div />
          {days.map(d => {
            const dt = new Date(d + "T00:00:00");
            return <div key={d} className={`text-center text-[11px] py-1 border-b ${d === today ? "font-bold text-teal-700" : "text-muted-foreground"}`}>
              {dt.toLocaleDateString("en-IN", { weekday: "short" })}<br />{dt.getDate()}
            </div>;
          })}
          {rooms.map(r => (
            <RoomRow key={r.id} room={r} days={days} start={start}
              bookings={visible.filter(b => b.room_id === r.id && b.check_out > start && b.check_in < addDays(start, DAYS))}
              onPick={onPick} onEmpty={onEmpty} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoomRow({ room, days, start, bookings, onPick, onEmpty }) {
  const idx = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(start + "T00:00:00")) / 86400000);
  return (
    <>
      <div className="text-sm font-semibold py-2 pr-2 border-b flex flex-col justify-center">
        {room.number}<span className="text-[10px] font-normal text-muted-foreground">{room.room_type}</span>
      </div>
      <div className="relative border-b" style={{ gridColumn: `span ${days.length}` }}>
        <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
          {days.map(d => (
            <button key={d} disabled={room.status === "maintenance"} onClick={() => onEmpty(room, d)}
              title={room.status === "maintenance" ? "Under maintenance" : `Book ${room.number} from ${d}`}
              className={`h-11 border-l ${room.status === "maintenance" ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-teal-50 dark:hover:bg-teal-950/30"}`} />
          ))}
        </div>
        {bookings.map(b => {
          const s = Math.max(0, idx(b.check_in)), e = Math.min(days.length, idx(b.check_out));
          if (e <= s) return null;
          return (
            <button key={b.id} onClick={() => onPick(b)}
              className={`absolute top-1.5 h-8 rounded-md px-2 text-left text-[11px] text-white font-medium truncate shadow-sm ${STATUS[b.status]?.bar}`}
              style={{ left: `calc(${(s / days.length) * 100}% + 2px)`, width: `calc(${((e - s) / days.length) * 100}% - 4px)` }}
              title={`${b.booking_no} · ${b.party_snapshot?.name} · ${b.check_in} → ${b.check_out}`}>
              {b.party_snapshot?.name}
            </button>
          );
        })}
      </div>
    </>
  );
}

function RoomDialog({ room, onClose, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { if (room) setF({ number: "", room_type: "", capacity: 2, tariff: 0, status: "available", notes: "", ...room }); }, [room]);
  if (!room) return null;
  const save = async () => {
    try {
      const body = { number: f.number, room_type: (f.room_type || "").trim() || "Standard", capacity: +f.capacity || 1, tariff: +f.tariff || 0, status: f.status, notes: f.notes || "" };
      if (room.id) await api.put(`/stay/rooms/${room.id}`, body); else await api.post("/stay/rooms", body);
      toast.success("Room saved"); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e, "Failed to save room")); }
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{room.id ? `Edit room ${room.number}` : "Add room"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Room no. *</Label><Input value={f.number || ""} onChange={e => setF({ ...f, number: e.target.value })} placeholder="101" /></div>
          <div className="space-y-1.5"><Label>Type</Label><Input value={f.room_type || ""} onChange={e => setF({ ...f, room_type: e.target.value })} placeholder="Standard / Deluxe / Suite" /></div>
          <div className="space-y-1.5"><Label>Tariff / night (₹, before GST)</Label><Input type="number" value={f.tariff ?? 0} onChange={e => setF({ ...f, tariff: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Capacity</Label><Input type="number" value={f.capacity ?? 2} onChange={e => setF({ ...f, capacity: e.target.value })} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Status</Label>
            <Select value={f.status || "available"} onValueChange={v => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="maintenance">Maintenance (can't be booked)</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">GST at this tariff: {(+f.tariff || 0) <= 7500 ? "5%" : "18%"}</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingDialog({ initial, rooms, onClose, onSaved }) {
  const [parties, setParties] = useState([]);
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!initial) return;
    api.get("/parties", { params: { type: "customer" } }).then(r => setParties(r.data));
    const t = todayISO();
    setF({ party_id: "", room_id: rooms[0]?.id || "", check_in: t, check_out: addDays(t, 1), adults: 1, children: 0,
      channel: "Direct", channel_ref: "", commission_amount: "", booking_type: "room", package_name: "",
      package_amount: "", id_proof: "", notes: "", tariff: "", gst_rate: "", ...initial,
      ...(initial.id ? { tariff: initial.tariff ?? "", gst_rate: initial.gst_rate ?? "" } : {}) });
  }, [initial, rooms]);
  if (!initial) return null;
  const isPkg = f.booking_type === "package";
  const room = rooms.find(r => r.id === f.room_id);
  const tariff = f.tariff === "" || f.tariff == null ? (room?.tariff || 0) : +f.tariff;
  const nights = Math.max(0, Math.round((new Date(f.check_out) - new Date(f.check_in)) / 86400000));
  const rate = f.gst_rate === "" || f.gst_rate == null ? (isPkg ? 5 : tariff <= 7500 ? 5 : 18) : +f.gst_rate;
  const base = isPkg ? (+f.package_amount || 0) : nights * tariff;
  const est = Math.round(base * (1 + rate / 100));

  const save = async () => {
    if (!f.party_id) { toast.error("Choose or add the guest"); return; }
    if (!isPkg && nights < 1) { toast.error("Check-out must be after check-in"); return; }
    if (isPkg && (!f.package_name.trim() || !(+f.package_amount > 0))) { toast.error("Enter the package name and amount"); return; }
    setSaving(true);
    try {
      const body = { party_id: f.party_id, room_id: isPkg ? (f.room_id || "") : f.room_id,
        check_in: f.check_in, check_out: f.check_out,
        adults: +f.adults || 1, children: +f.children || 0, id_proof: f.id_proof, notes: f.notes,
        channel: f.channel, channel_ref: f.channel_ref, commission_amount: +f.commission_amount || 0,
        booking_type: f.booking_type, package_name: f.package_name, package_amount: +f.package_amount || 0,
        tariff: f.tariff === "" ? null : +f.tariff, gst_rate: f.gst_rate === "" ? null : +f.gst_rate };
      const { data } = initial.id ? await api.put(`/stay/bookings/${initial.id}`, body) : await api.post("/stay/bookings", body);
      toast.success(initial.id ? "Booking updated" : `Booked ${data.booking_no}`);
      onSaved(data); onClose();
    } catch (e) { toast.error(errMsg(e, "Could not save booking")); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{initial.id ? `Edit ${initial.booking_no}` : "New booking"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex gap-2">
            {[["room", "🛏 Room stay"], ["package", "🧳 Trip / package"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setF(x => ({ ...x, booking_type: v }))}
                className={`flex-1 rounded-xl border-2 py-2 text-sm font-medium ${f.booking_type === v ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" : "border-gray-100 dark:border-gray-800"}`}>{l}</button>
            ))}
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Guest *</Label>
            <PartySelect parties={parties} value={f.party_id} role="customer" placeholder="Select guest"
              onChange={v => setF(x => ({ ...x, party_id: v }))} onCreated={p => setParties(ps => [...ps, p])} />
          </div>
          <div className="space-y-1.5"><Label>Check-in</Label><Input type="date" value={f.check_in || ""} onChange={e => setF({ ...f, check_in: e.target.value, check_out: f.check_out <= e.target.value ? addDays(e.target.value, 1) : f.check_out })} /></div>
          <div className="space-y-1.5"><Label>Check-out</Label><Input type="date" value={f.check_out || ""} min={f.check_in} onChange={e => setF({ ...f, check_out: e.target.value })} /></div>
          {isPkg && <div className="col-span-2 space-y-1.5"><Label>Package / trip name *</Label>
            <Input value={f.package_name} onChange={e => setF({ ...f, package_name: e.target.value })} placeholder="e.g. Coorg 2N/3D homestay + trek" /></div>}
          {isPkg && <div className="space-y-1.5"><Label>Package amount (before GST) *</Label>
            <Input type="number" value={f.package_amount} onChange={e => setF({ ...f, package_amount: e.target.value })} /></div>}
          <div className="space-y-1.5"><Label>Room{isPkg ? " (optional)" : ""}</Label>
            <Select value={f.room_id} onValueChange={v => setF({ ...f, room_id: v })}>
              <SelectTrigger><SelectValue placeholder="Room" /></SelectTrigger>
              <SelectContent>{rooms.filter(r => r.status !== "maintenance" || r.id === f.room_id).map(r => <SelectItem key={r.id} value={r.id}>{r.number} · {r.room_type} · {inr(r.tariff)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Channel</Label>
            <Select value={f.channel} onValueChange={v => setF({ ...f, channel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNELS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Channel reference</Label>
            <Input value={f.channel_ref} onChange={e => setF({ ...f, channel_ref: e.target.value })} placeholder="OTA booking id" /></div>
          <div className="space-y-1.5"><Label>Channel commission (₹)</Label>
            <Input type="number" value={f.commission_amount} onChange={e => setF({ ...f, commission_amount: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5"><Label>Adults</Label><Input type="number" min="1" value={f.adults} onChange={e => setF({ ...f, adults: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Children</Label><Input type="number" min="0" value={f.children} onChange={e => setF({ ...f, children: e.target.value })} /></div>
          {!isPkg && <div className="space-y-1.5"><Label>Tariff / night</Label><Input type="number" value={f.tariff} placeholder={`${room?.tariff ?? 0} (room rate)`} onChange={e => setF({ ...f, tariff: e.target.value })} /></div>}
          <div className="space-y-1.5"><Label>GST %</Label><Input type="number" value={f.gst_rate} placeholder={`${rate} (auto)`} onChange={e => setF({ ...f, gst_rate: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>ID proof (optional)</Label><Input value={f.id_proof} onChange={e => setF({ ...f, id_proof: e.target.value })} placeholder="Aadhaar / Passport no." /></div>
        </div>
        <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 p-3 text-sm">
          {isPkg
            ? <>Package {inr(+f.package_amount || 0)} + {rate}% GST ≈ <strong>{inr(est)}</strong></>
            : <>{nights} night{nights !== 1 ? "s" : ""} × {inr(tariff)} + {rate}% GST ≈ <strong>{inr(est)}</strong></>}
          {+f.commission_amount > 0 && <div className="text-xs text-muted-foreground mt-1">Less {f.channel} commission {inr(+f.commission_amount)} (+GST) → booked as an expense at check-out</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700">{saving ? "Saving…" : initial.id ? "Save" : "Book room"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingDetail({ booking: b, onClose, onChanged, onEdit }) {
  const nav = useNavigate();
  const [adv, setAdv] = useState({ amount: "", mode: "UPI", reference: "" });
  const [chg, setChg] = useState({ name: "", amount: "", gst_rate: 18 });
  const [busy, setBusy] = useState(false);
  if (!b) return null;
  const act = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast.success(typeof ok === "function" ? ok(r.data) : ok); await onChanged(); }
    catch (e) { toast.error(errMsg(e, "Failed")); }
    finally { setBusy(false); }
  };
  const open = ["booked", "checked_in"].includes(b.status);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{b.booking_no}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[b.status]?.cls}`}>{STATUS[b.status]?.label}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Guest</span><div className="font-medium">{b.party_snapshot?.name}</div><div className="text-xs text-muted-foreground">{b.party_snapshot?.phone}</div></div>
          <div><span className="text-muted-foreground">Room</span><div className="font-medium">{b.room_number} · {b.room_type}</div></div>
          <div><span className="text-muted-foreground">Stay</span><div>{fmtDate(b.check_in)} → {fmtDate(b.check_out)} ({b.nights} night{b.nights !== 1 ? "s" : ""})</div></div>
          <div><span className="text-muted-foreground">Guests</span><div>{b.adults} adult{b.adults !== 1 ? "s" : ""}{b.children ? `, ${b.children} child` : ""} · {b.channel || b.source}{b.channel_ref ? ` · ${b.channel_ref}` : ""}</div></div>
        </div>

        <div className="rounded-lg border divide-y text-sm">
          <div className="flex justify-between px-3 py-2">
            <span>{b.booking_type === "package"
              ? <>{b.package_name || "Package"} <span className="text-xs text-muted-foreground">(GST {b.gst_rate_applied}%)</span></>
              : <>Room: {b.nights} × {inr(b.tariff)} <span className="text-xs text-muted-foreground">(GST {b.gst_rate_applied}%)</span></>}</span>
            <span>{inr(b.room_amount)}</span></div>
          {(b.charges || []).map(c => (
            <div key={c.id} className="flex justify-between items-center px-3 py-2">
              <span>{c.name} <span className="text-xs text-muted-foreground">(GST {c.gst_rate}%)</span></span>
              <span className="flex items-center gap-2">{inr(c.amount)}
                {open && <button className="text-rose-500" onClick={() => act(() => api.delete(`/stay/bookings/${b.id}/charges/${c.id}`), "Charge removed")}><Trash2 className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 font-semibold"><span>Total incl. GST</span><span>{inr(b.estimated_total)}</span></div>
          <div className="flex justify-between px-3 py-2 text-emerald-700"><span>Advance received</span><span>− {inr(b.advance_paid)}</span></div>
          <div className="flex justify-between px-3 py-2 font-semibold text-rose-600"><span>Balance</span><span>{inr(b.balance)}</span></div>
          {b.commission_total > 0 && (
            <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground">
              <span>{b.channel} commission incl. GST (expense)</span><span>{inr(b.commission_total)} · net {inr(b.net_payout)}</span>
            </div>)}
        </div>

        {open && (
          <div className="grid gap-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1"><Label className="text-xs">Add charge</Label><Input value={chg.name} onChange={e => setChg({ ...chg, name: e.target.value })} placeholder="Breakfast, laundry, extra bed…" /></div>
              <Input className="w-24" type="number" value={chg.amount} onChange={e => setChg({ ...chg, amount: e.target.value })} placeholder="₹" />
              <Input className="w-16" type="number" value={chg.gst_rate} onChange={e => setChg({ ...chg, gst_rate: e.target.value })} title="GST %" />
              <Button variant="outline" disabled={busy || !chg.name || !(+chg.amount > 0)}
                onClick={() => act(() => api.post(`/stay/bookings/${b.id}/charges`, { name: chg.name, amount: +chg.amount, gst_rate: +chg.gst_rate || 0 }), "Charge added").then(() => setChg({ name: "", amount: "", gst_rate: 18 }))}>Add</Button>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1"><Label className="text-xs">Advance / payment received</Label><Input type="number" value={adv.amount} onChange={e => setAdv({ ...adv, amount: e.target.value })} placeholder="₹ amount" /></div>
              <Select value={adv.mode} onValueChange={v => setAdv({ ...adv, mode: v })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{["UPI", "Cash", "Card", "Bank Transfer"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" disabled={busy || !(+adv.amount > 0)}
                onClick={() => act(() => api.post(`/stay/bookings/${b.id}/advance`, { amount: +adv.amount, mode: adv.mode }), "Payment recorded").then(() => setAdv({ amount: "", mode: "UPI", reference: "" }))}>
                <IndianRupee className="h-4 w-4 mr-1" />Receive</Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {open && <Button variant="outline" disabled={busy} onClick={() => onEdit(b)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>}
            {open && <Button variant="outline" disabled={busy} className="text-rose-600"
              onClick={() => window.confirm(`Cancel ${b.booking_no}? The room is released.`) && act(() => api.post(`/stay/bookings/${b.id}/cancel`), "Booking cancelled")}><Ban className="h-4 w-4 mr-1" />Cancel</Button>}
          </div>
          <div className="flex gap-2">
            {b.status === "booked" && <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act(() => api.post(`/stay/bookings/${b.id}/check-in`), "Guest checked in")}><LogIn className="h-4 w-4 mr-1" />Check in</Button>}
            {b.status === "checked_in" && <Button disabled={busy} className="bg-teal-600 hover:bg-teal-700"
              onClick={() => act(() => api.post(`/stay/bookings/${b.id}/check-out`), d => `Checked out — ${d.invoice_no} for ${inr(d.total)}${d.balance > 0 ? `, balance ${inr(d.balance)} due` : ", fully paid"}`)}>
              <LogOut className="h-4 w-4 mr-1" />Check out & bill</Button>}
            {b.invoice_id && <Button variant="outline" onClick={() => nav(`/sales/${b.invoice_id}`)}><FileText className="h-4 w-4 mr-1" />{b.invoice_no}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
