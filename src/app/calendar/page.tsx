"use client";

import "./calendar.css";


// All selectable statuses for the status filter UI
const ALL_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"] as const;

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { DateSelectArg } from "@fullcalendar/core";
import deLocale from "@fullcalendar/core/locales/de";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

type Pitch = { id: string; name: string; type: "GROSSFELD" | "KOMPAKT" };
type Team = { id: string; name: string; age_u: number };

type BookingStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";

type PitchRef = { id: string; name: string; type: "GROSSFELD" | "KOMPAKT" };
type TeamRef = { id: string; name: string };

type Booking = {
  id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  note: string | null;
  pitch_id: string;
  team_id: string;
  // embedded via select: pitches:pitch_id (...), teams:team_id (...)
  pitches: PitchRef | null;
  teams: TeamRef | null;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function roundToStep(date: Date, stepMinutes: number) {
  const d = new Date(date);
  const ms = stepMinutes * 60 * 1000;
  return new Date(Math.round(d.getTime() / ms) * ms);
}

export default function CalendarPage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [pitchFilterIds, setPitchFilterIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<BookingStatus[]>(["REQUESTED", "APPROVED"]);

  const [pitchPickerOpen, setPitchPickerOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [initialView] = useState<"timeGridWeek" | "dayGridMonth">("timeGridWeek");
  const [initialDate] = useState<Date>(new Date());

  // Tooltip
  const [tip, setTip] = useState<{ show: boolean; x: number; y: number; text: string }>({
    show: false,
    x: 0,
    y: 0,
    text: "",
  });
  const lastMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // -------------------------
  // View switcher (Woche/Monat/Liste)
  // -------------------------
  const calendarRef = useRef<FullCalendar | null>(null);
  const [viewMode, setViewMode] = useState<"week" | "month" | "list" | "dashboard">("week");

  // List view range (von/bis, inkl. Tage)
  const [listFrom, setListFrom] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
const [listTo, setListTo] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
function hideTip() {
    setTip((t) => ({ ...t, show: false }));
  }

  function positionTip(x: number, y: number, text: string) {
    // simple clamp inside viewport
    const padding = 10;
    const maxW = 380;
    const approxW = Math.min(maxW, Math.max(220, text.length * 6));
    const approxH = 64;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nx = x + 14;
    let ny = y + 14;

    if (nx + approxW + padding > vw) nx = vw - approxW - padding;
    if (ny + approxH + padding > vh) ny = vh - approxH - padding;

    setTip({ show: true, x: nx, y: ny, text });
  }

  // Mouse tracking for tooltip positioning
  useEffect(() => {
    function onMove(e: MouseEvent) {
      lastMouse.current = { x: e.clientX, y: e.clientY };
      if (tip.show) positionTip(e.clientX, e.clientY, tip.text);
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [tip.show, tip.text]);

  // Default List-Zeitraum: aktuelle Woche (Mo..So)
  useEffect(() => {
    if (listFrom || listTo) return;
    const now = new Date();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragInsertMode, setDragInsertMode] = useState<"before" | "after">("before");
    const day = (now.getDay() + 6) % 7; // Mon=0
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - day);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    setListFrom(toISO(monday));
    setListTo(toISO(sunday));
  }, [listFrom, listTo]);

  // -------------------------
  // Session + Profil laden
  // -------------------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,full_name,role,active")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profErr) {
        console.error(profErr);
        setProfile(null);
      } else {
        setProfile((prof ?? null) as Profile | null);
      }

      setSessionChecked(true);
    })();
  }, []);

  // -------------------------
  // Pitches + Teams laden
  // -------------------------
  useEffect(() => {
    if (!sessionChecked) return;

    (async () => {
      setError(null);

      const [pitchesRes, teamsRes] = await Promise.all([
        supabase.from("pitches").select("id,name,type").order("name"),
        supabase.from("teams").select("id,name,age_u").order("age_u").order("name"),
      ]);

      if (pitchesRes.error) return setError(pitchesRes.error.message);
      if (teamsRes.error) return setError(teamsRes.error.message);

      const p = (pitchesRes.data ?? []) as Pitch[];
      const t = (teamsRes.data ?? []) as Team[];

      setPitches(p);
      setTeams(t);

      // Default: alle Plätze aktiv
      setPitchFilterIds(p.map((x) => x.id));
    })();
  }, [sessionChecked]);

  const pitchById = useMemo(() => {
    const m = new Map<string, Pitch>();
    pitches.forEach((p) => m.set(p.id, p));
    return m;
  }, [pitches]);

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [teams]);

  // -------------------------
  // Bookings laden
  // -------------------------
  async function loadBookings(start: Date, end: Date) {
    setError(null);

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const { data, error } = await supabase
      .from("bookings")
      .select(
        `
        id, start_at, end_at, status, note, pitch_id, team_id,
        pitches:pitch_id ( id, name, type ),
        teams:team_id ( id, name )
      `
      )
      .gte("start_at", startISO)
      .lt("start_at", endISO)
      .in("status", statusFilter)
      .order("start_at", { ascending: true });

    if (error) {
      console.error(error);
      setError(error.message);
      setBookings([]);
      return;
    }

    const rows = (data ?? []) as any[];

    const list: Booking[] = rows.map((r) => ({
      ...r,
      pitches: Array.isArray(r.pitches) ? (r.pitches[0] ?? null) : (r.pitches ?? null),
      teams: Array.isArray(r.teams) ? (r.teams[0] ?? null) : (r.teams ?? null),
    }));

    setBookings(list);
  }

  const filteredBookings = useMemo(() => {
    const allowed = new Set(pitchFilterIds);
    return bookings.filter((b) => allowed.has(b.pitch_id) && statusFilter.includes(b.status));
  }, [bookings, pitchFilterIds, statusFilter]);

  // -------------------------
  // FullCalendar events
  // -------------------------
  const events = useMemo(() => {
    return filteredBookings.map((b) => {
      const p = b.pitches?.name ?? pitchById.get(b.pitch_id)?.name ?? "Platz";
      const t = b.teams?.name ?? teamById.get(b.team_id)?.name ?? "Team";

      return {
        id: b.id,
        title: `${p} – ${t}`,
        start: b.start_at,
        end: b.end_at,
        extendedProps: {
          status: b.status,
          tooltipText: `${p}\n${t}\n${fmtTime(b.start_at)}–${fmtTime(b.end_at)}\n${b.status}`,
        },
      };
    });
  }, [filteredBookings, pitchById, teamById]);

  // -------------------------
  // LIST VIEW (Variante A: Zeitraster x Plätze)
  // -------------------------
  const LIST_START_HOUR = 8;
  const LIST_END_HOUR = 22;
  const SLOT_MIN = 30;


// Overlap-Layout: doppelte Buchungen nebeneinander darstellen (pro Platz / Tag)
type OverlapBox = { id: string; start: Date; end: Date };
type OverlapPos = { colIndex: number; colCount: number };

function boxesOverlap(a: OverlapBox, b: OverlapBox) {
  return a.start < b.end && a.end > b.start;
}

function computeOverlapLayout(boxes: OverlapBox[]): Map<string, OverlapPos> {
  // Greedy column assignment (ähnlich Kalender)
  const sorted = [...boxes].sort((a, b) => a.start.getTime() - b.start.getTime());
  const colsEnd: Date[] = []; // Endzeit pro Spalte
  const colIndexById = new Map<string, number>();

  for (const ev of sorted) {
    let col = 0;
    for (; col < colsEnd.length; col++) {
      if (ev.start >= colsEnd[col]) break; // Spalte frei
    }
    if (col === colsEnd.length) colsEnd.push(ev.end);
    else colsEnd[col] = ev.end;
    colIndexById.set(ev.id, col);
  }

  // Für jedes Event: maximale Spaltenanzahl seiner Overlap-Gruppe bestimmen
  const out = new Map<string, OverlapPos>();
  for (const a of sorted) {
    let maxCol = colIndexById.get(a.id) ?? 0;
    for (const b of sorted) {
      if (a.id === b.id) continue;
      if (boxesOverlap(a, b)) {
        maxCol = Math.max(maxCol, colIndexById.get(b.id) ?? 0);
      }
    }
    out.set(a.id, { colIndex: colIndexById.get(a.id) ?? 0, colCount: maxCol + 1 });
  }
  return out;
}

  function parseDateInput(value: string) {
    if (!value) return null; // YYYY-MM-DD
    const [y, m, d] = value.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function addDays(d: Date, days: number) {
    const out = new Date(d);
    out.setDate(out.getDate() + days);
    return out;
  }

  function startOfDay(d: Date) {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
  }

  function clamp(date: Date, min: Date, max: Date) {
    return new Date(Math.max(min.getTime(), Math.min(max.getTime(), date.getTime())));
  }

  function minutesSinceStart(d: Date) {
    return d.getHours() * 60 + d.getMinutes() - LIST_START_HOUR * 60;
  }

  function slotIndex(d: Date) {
    return Math.floor(minutesSinceStart(d) / SLOT_MIN);
  }

  function buildSlots() {
    const slots: { label: string; minutes: number }[] = [];
    const startMin = LIST_START_HOUR * 60;
    const endMin = LIST_END_HOUR * 60;
    for (let m = startMin; m < endMin; m += SLOT_MIN) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      slots.push({ label: `${hh}:${mm}`, minutes: m });
    }
    return slots;
  }

  const listSlots = useMemo(() => buildSlots(), []);

  const visiblePitchesForList = useMemo(() => {
    const allowed = new Set(pitchFilterIds);
    return pitches.filter((p) => allowed.has(p.id));
  }, [pitches, pitchFilterIds]);

  const listDays = useMemo(() => {
    const from = parseDateInput(listFrom);
    const to = parseDateInput(listTo);
    if (!from || !to) return [] as Date[];
    const a = startOfDay(from);
    const b = startOfDay(to);
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;

    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));
    return days;
  }, [listFrom, listTo]);

  async function loadListRange() {
    const from = parseDateInput(listFrom);
    const to = parseDateInput(listTo);
    if (!from || !to) {
      setError("Bitte Zeitraum (von/bis) wählen.");
      return;
    }

    const a = startOfDay(from);
    const b = startOfDay(to);
    const start = a <= b ? a : b;
    const endInclusive = a <= b ? b : a;
    const endExclusive = addDays(endInclusive, 1);
    await loadBookings(start, endExclusive);
  }

  // -------------------------
  // Navigation to request page
  // -------------------------
  function goToRequestNew(start: Date, end: Date, fromView: string, focusDate: Date) {
    const params = new URLSearchParams();
    params.set("start", start.toISOString());
    params.set("end", end.toISOString());
    params.set("from", fromView);
    params.set("focus", focusDate.toISOString());
    window.location.href = `/request/new?${params.toString()}`;
  }

  
// -------------------------
// Dashboard (Cards per pitch)
// -------------------------
// -------------------------
// Dashboard (Cards per pitch) + Drag & Drop
// -------------------------
function PitchDashboardView({
  pitches,
  bookings,
}: {
  pitches: { id: string; name: string }[];
  bookings: any[];
}) {
  const norm = (d: any) => (d instanceof Date ? d : new Date(String(d)));

  // Store pitch order locally so you can rearrange tiles
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("fcstern_pitch_order") : null;
      const arr = raw ? (JSON.parse(raw) as unknown) : null;
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  });

  // Keep order in sync when pitches change
  useEffect(() => {
    const ids = pitches.map((p) => String(p.id));
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...missing];
      try {
        window.localStorage.setItem("fcstern_pitch_order", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [pitches]);

  const sortedPitches = useMemo(() => {
    if (!order.length) return pitches;
    const map = new Map(pitches.map((p) => [String(p.id), p]));
    const out: { id: string; name: string }[] = [];
    for (const id of order) {
      const p = map.get(String(id));
      if (p) out.push(p);
    }
    // fallback in case something was missing
    for (const p of pitches) if (!out.some((x) => String(x.id) === String(p.id))) out.push(p);
    return out;
  }, [pitches, order]);

  const byPitch = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const b of bookings || []) {
      const pid = String(b.pitch_id ?? "");
      if (!pid) continue;
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid)!.push(b);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => norm(a.start_at).getTime() - norm(b.start_at).getTime());
    }
    return m;
  }, [bookings]);

  const teamName = (b: any) => {
    const cleanup = (s: string) =>
      s
        .replace(/\\,/g, ",")
        .replace(/\[(?:BFV_[^\]]+|BFVTEAM_ID:[^\]]+)\]/gi, "")
        .replace(/\bBFV_UID:[^\s,\]]+/gi, "")
        .replace(/\bBFVTEAM_ID:[^\s,\]]+/gi, "")
        .replace(/\\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const takeBeforeRealComma = (raw: string) => {
      const placeholder = "__ESC_COMMA__";
      const tmp = raw.replace(/\\,/g, placeholder);
      return (tmp.split(",")[0] || "").replace(new RegExp(placeholder, "g"), ",");
    };

    const normalizeLabel = (raw: string) => {
      let label = cleanup(takeBeforeRealComma(raw));
      if (!label.includes(" – ")) label = label.replace(/\s-\s/, " – ");
      return label;
    };

    const note = typeof b?.note === "string" ? b.note.trim() : "";
    if (note) {
      const label = normalizeLabel(note);
      if (label) return label;
    }

    const tt = typeof b?.tooltipText === "string" ? b.tooltipText.trim() : "";
    if (tt) {
      const firstLine = tt.split(/\r?\n/)[0] || "";
      const label = normalizeLabel(firstLine);
      if (label) return label;
    }

    const tn = typeof b?.teams?.name === "string" ? b.teams.name.trim() : "";
    return tn || "—";
  };

  const timeRange = (b: any) => {
    const s = norm(b.start_at);
    const e = norm(b.end_at);
    return (
      s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      "–" +
      e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const now = new Date();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragInsertMode, setDragInsertMode] = useState<"before" | "after">("before");

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetId) return;

    setOrder((prev) => {
      const next = prev.length ? [...prev] : pitches.map((p) => String(p.id));
      const from = next.indexOf(String(draggedId));
      const targetIndex = next.indexOf(String(targetId));
      if (from === -1 || targetIndex === -1) return prev;

      next.splice(from, 1);
      const newTargetIndex = next.indexOf(String(targetId));
      const insertIndex = dragInsertMode === "after" ? newTargetIndex + 1 : newTargetIndex;
      next.splice(insertIndex, 0, String(draggedId));

      try {
        window.localStorage.setItem("fcstern_pitch_order", JSON.stringify(next));
      } catch {}
      return next;
    });

    setDragOverId(null);
    setDragInsertMode("before");
  };

  const onDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Top/Bottom zones have priority, so vertical moves work on wide cards too.
    const topZone = rect.height * 0.28;
    const bottomZone = rect.height * 0.72;

    let mode: "before" | "after";
    if (y <= topZone) mode = "before";
    else if (y >= bottomZone) mode = "after";
    else mode = x >= rect.width / 2 ? "after" : "before";

    setDragOverId(targetId);
    setDragInsertMode(mode);
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        alignItems: "start",
      }}
    >
      {sortedPitches.map((p) => {
        const items = byPitch.get(String(p.id)) ?? [];
        const next = items.find((x) => norm(x.end_at) > now) ?? null;

        return (
          <div
            key={p.id}
            className="card"
            style={{
              padding: 12,
              cursor: "grab",
              border:
                dragOverId === String(p.id) ? "1px dashed rgba(180,220,255,0.65)" : undefined,
              boxShadow:
                dragOverId === String(p.id)
                  ? dragInsertMode === "before"
                    ? "inset 0 3px 0 rgba(90,200,255,0.9)"
                    : "inset 0 -3px 0 rgba(90,200,255,0.9)"
                  : undefined,
            }}
            draggable
            onDragStart={(e) => onDragStart(e, String(p.id))}
            onDragEnd={() => {
              setDragOverId(null);
              setDragInsertMode("before");
            }}
            onDragOver={(e) => onDragOver(e, String(p.id))}
            onDrop={(e) => onDrop(e, String(p.id))}
            title="Zum Umsortieren ziehen"
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
              <div style={{ opacity: 0.35, fontSize: 10 }}>
                {items.length} Buchung{items.length === 1 ? "" : "en"}
              </div>
            </div>

            {next && (
              <div
                style={{
                  marginTop: 10,
                  position: "relative",
                  padding: 16,
                  border: "1px solid rgba(16,185,129,0.25)",
                  borderRadius: 12,
                  background: "rgba(16,185,129,0.10)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -15,
                    right: 10,
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(16,185,129,0.18)",
                    border: "1px solid rgba(16,185,129,0.35)",
                    lineHeight: 1.2,
                  }}
                >
                  Als Nächstes
                </span>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    lineHeight: 1.2,
                    minWidth: 0,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "horizontal",
                  }}
                >
                  {teamName(next)}
                </div>
                <div style={{ opacity: 0.92, marginTop: 4, fontSize: 13, fontWeight: 800 }}>
                  {timeRange(next)}
                </div>
              </div>
            )}

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              {items.slice(0, 10).map((b) => {
                const start = norm(b.start_at);
                const end = norm(b.end_at);
                const isNow = start <= now && end > now;

                return (
                  <div
                    key={b.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: 16,
                      border: "1px solid rgba(16,185,129,0.25)",
                      borderRadius: 12,
                      background: "rgba(16,185,129,0.10)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2, minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "horizontal" }}>
                          {teamName(b)}
                        </div>
                        {isNow && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "rgba(59,130,246,0.18)",
                              border: "1px solid rgba(59,130,246,0.35)",
                            }}
                          >
                            läuft
                          </span>
                        )}
                      </div>
                      <div style={{ opacity: 0.92, fontSize: 13, fontWeight: 800, marginTop: 4 }}>
                        {timeRange(b)}
                        
                      </div>
                    </div>
                  </div>
                );
              })}

              {items.length === 0 && (
                <div style={{ opacity: 0.65, fontSize: 13, padding: "10px 0" }}>Keine Buchungen im Zeitraum.</div>
              )}

              {items.length > 10 && <div style={{ opacity: 0.7, fontSize: 12 }}>+{items.length - 10} weitere…</div>}
            </div>

            {/* Extra drop zone below each pitch card so you can place a column "under" it */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(String(p.id));
                setDragInsertMode("after");
              }}
              onDrop={(e) => {
                setDragOverId(String(p.id));
                setDragInsertMode("after");
                onDrop(e, String(p.id));
              }}
              style={{
                height: 34,
                borderRadius: 10,
                border:
                  dragOverId === String(p.id) && dragInsertMode === "after"
                    ? "1px dashed rgba(90,200,255,0.55)"
                    : "1px dashed transparent",
                background:
                  dragOverId === String(p.id) && dragInsertMode === "after"
                    ? "rgba(90,200,255,0.08)"
                    : "transparent",
              }}
            />
          </div>
        );
      })}

      {/* Global end-zone makes it easy to move a pitch to the very end / next row */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverId("__END__");
          setDragInsertMode("after");
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromId = e.dataTransfer.getData("text/plain");
          if (!fromId) return;
          setOrder((prev) => {
            const base = prev.length ? [...prev] : pitches.map((x) => String(x.id));
            const fromIdx = base.findIndex((id) => String(id) === String(fromId));
            if (fromIdx < 0) return prev;
            const [moved] = base.splice(fromIdx, 1);
            base.push(String(moved));
            try {
              window.localStorage.setItem("fcstern_pitch_order", JSON.stringify(base));
            } catch {}
            return base;
          });
          setDragOverId(null);
          setDragInsertMode("before");
        }}
        style={{
          gridColumn: "1 / -1",
          height: 42,
          borderRadius: 12,
          border: dragOverId === "__END__" ? "1px dashed rgba(90,200,255,0.55)" : "1px dashed transparent",
          background: dragOverId === "__END__" ? "rgba(90,200,255,0.08)" : "transparent",
        }}
      />
    </div>
  );
}

const isAdmin = useMemo(() => (profile?.role || "TRAINER").toUpperCase() === "ADMIN", [profile]);

  if (!sessionChecked) return null;

  return (
    <div style={{ maxWidth: viewMode === "list" || viewMode === "dashboard" ? "none" : 1200, width: "100%", margin: "24px auto", padding: 16 }}>
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }

          html, body { background: #fff !important; }
          body { color: #111 !important; }

          .no-print { display: none !important; }
          .print-wrap { overflow: visible !important; }

          .print-grid {
            width: 100% !important;
            min-width: 0 !important;
            gap: 6px !important;
          }

          .print-event { font-size: 10px !important; line-height: 1.1 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .print-day {
            break-before: page;
            break-inside: avoid;
            page-break-before: always;
            page-break-inside: avoid;
          }
          .print-day:first-of-type {
            break-before: auto;
            page-break-before: auto;
          }
          .print-day .day-header {
            break-after: avoid;
            page-break-after: avoid;
          }
        }
      `}</style>

      {/* Header */}
      <div
        className="card no-print"
        style={{
          padding: 16,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>FC Stern – Platzbelegung</div>
          <div style={{ opacity: 0.85, marginTop: 4 }}>
            {profile?.full_name ?? "—"} • Rolle: {profile?.role ?? "—"} • {profile?.active ? "aktiv" : "inaktiv"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/request/new"
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              textDecoration: "none",
            }}
          >
            + Antrag
          </Link>

          {isAdmin && (
            <>
              <Link
                href="/approve"
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  textDecoration: "none",
                }}
              >
                Genehmigen
              </Link>

              <Link
                href="/bfv"
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  textDecoration: "none",
                }}
              >
                Ligaspiele planen (BFV)
              </Link>
            </>
          )}

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "#e6edf3",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      
      {/* Zeitraum */}
{error && <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{error}</div>}

      {/* Kalender */}
      <div style={{ marginTop: 16 }}>
        {/* View Switcher */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => {
              setViewMode("week");
              const api = (calendarRef.current as any)?.getApi?.();
              api?.changeView?.("timeGridWeek");
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: viewMode === "week" ? "rgba(255,255,255,0.10)" : "transparent",
              color: "#e6edf3",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Woche
          </button>
          <button
            onClick={() => {
              setViewMode("month");
              const api = (calendarRef.current as any)?.getApi?.();
              api?.changeView?.("dayGridMonth");
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: viewMode === "month" ? "rgba(255,255,255,0.10)" : "transparent",
              color: "#e6edf3",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Monat
          </button>
          <button
            onClick={async () => {
              setViewMode("list");
              await loadListRange();
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: viewMode === "list" ? "rgba(255,255,255,0.10)" : "transparent",
              color: "#e6edf3",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Liste
          </button>

<button
  onClick={async () => {
    setViewMode("dashboard");
    await loadListRange();
  }}
  style={{
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: viewMode === "dashboard" ? "rgba(255,255,255,0.10)" : "transparent",
    color: "#e6edf3",
    fontWeight: 800,
    cursor: "pointer",
  }}
>
  Dashboard
</button>
        </div>

        

{viewMode === "dashboard" ? (
  <div className="card" style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
      <div>
        <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 6 }}>Von</div>
        <input
          type="date"
          value={listFrom}
          onChange={(e) => setListFrom(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #273243",
            background: "transparent",
            color: "#e6edf3",
          }}
        />
      </div>
      <div>
        <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 6 }}>Bis</div>
        <input
          type="date"
          value={listTo}
          onChange={(e) => setListTo(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #273243",
            background: "transparent",
            color: "#e6edf3",
          }}
        />
      </div>
      <button onClick={loadListRange} style={{ padding: "9px 12px", borderRadius: 12, fontWeight: 800 }}>
        Laden
      </button>
      <div style={{ opacity: 0.75, fontSize: 13, marginLeft: 8 }}>
        Hinweis: Es werden die aktuellen Plätze- und Status-Filter berücksichtigt.
      </div>
    </div>

    <PitchDashboardView pitches={pitches} bookings={filteredBookings} />
    {listDays.length === 0 && <div style={{ opacity: 0.8, marginTop: 10 }}>Bitte Zeitraum wählen.</div>}
  </div>
) : viewMode !== "list" ? (
          <FullCalendar
            ref={calendarRef as any}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
            initialView={initialView}
            initialDate={initialDate}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            buttonText={{
              today: "Heute",
            }}
            locale={deLocale}
            firstDay={1}
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={false}
            slotDuration="00:30:00"
            snapDuration="00:30:00"
            nowIndicator
            weekends
            height="auto"
            events={events}
            datesSet={(arg) => {
              hideTip();
              loadBookings(arg.start, arg.end);
            }}
            eventClassNames={(arg) => {
              const s = String(arg.event.extendedProps.status || "").toUpperCase();
              return [`status-${s}`];
            }}
            selectable={true}
            selectMirror={true}
            unselectAuto={true}
            selectMinDistance={5}
            select={(arg: DateSelectArg) => {
              hideTip();
              if (arg.view?.type !== "timeGridWeek") return;

              const step = 30;
              const start = roundToStep(arg.start, step);
              const end = roundToStep(arg.end, step);

              const startMs = start.getTime();
              const endMs = end.getTime();
              const durationMin = (endMs - startMs) / 60000;

              const finalEnd =
                !Number.isFinite(durationMin) || durationMin < 30 ? new Date(startMs + 60 * 60 * 1000) : end;

              goToRequestNew(start, finalEnd, "timeGridWeek", start);
            }}
            dateClick={(arg) => {
              hideTip();
              if (arg.view?.type !== "dayGridMonth") return;

              const start = new Date(arg.date);
              start.setHours(12, 0, 0, 0);
              const end = new Date(start.getTime() + 60 * 60 * 1000);

              goToRequestNew(start, end, "dayGridMonth", start);
            }}
            eventMouseEnter={(info) => {
              const text = String(info.event.extendedProps.tooltipText || info.event.title || "");
              const { x, y } = lastMouse.current;

              setTip({ show: true, x: x + 14, y: y + 14, text });
              requestAnimationFrame(() => positionTip(lastMouse.current.x, lastMouse.current.y, text));
            }}
            eventMouseLeave={() => hideTip()}
          />
        ) : (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
              <div>
                <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 6 }}>Von</div>
                <input
                  type="date"
                  value={listFrom}
                  onChange={(e) => setListFrom(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #273243",
                    background: "transparent",
                    color: "#e6edf3",
                  }}
                />
              </div>
              <div>
                <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 6 }}>Bis</div>
                <input
                  type="date"
                  value={listTo}
                  onChange={(e) => setListTo(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #273243",
                    background: "transparent",
                    color: "#e6edf3",
                  }}
                />
              </div>
              <button onClick={loadListRange} style={{ padding: "9px 12px", borderRadius: 12, fontWeight: 800 }}>
                Laden
              </button>
              <div style={{ opacity: 0.75, fontSize: 13, marginLeft: 8 }}>
                Hinweis: Es werden die aktuellen Plätze- und Status-Filter berücksichtigt.
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
              {listDays.map((day) => {
                const dayStart = new Date(day);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = addDays(dayStart, 1);

                // bookings that overlap this day
                const dayBookings = filteredBookings.filter((b) => {
                  const bs = new Date(b.start_at);
                  const be = new Date(b.end_at);
                  return bs < dayEnd && be > dayStart;
                });


// Overlap-Layout pro Platz (damit doppelte Buchungen nebeneinander angezeigt werden)
const overlapPosById = new Map<string, { colIndex: number; colCount: number }>();
const minT = new Date(dayStart.getTime() + LIST_START_HOUR * 60 * 60 * 1000);
const maxT = new Date(dayStart.getTime() + LIST_END_HOUR * 60 * 60 * 1000);

for (const p of visiblePitchesForList) {
  const boxes = dayBookings
    .filter((b) => b.pitch_id === p.id)
    .map((b) => {
      const bsRaw = new Date(b.start_at);
      const beRaw = new Date(b.end_at);
      const start = clamp(bsRaw, minT, maxT);
      const end = clamp(beRaw, minT, maxT);
      return { id: b.id, start, end };
    })
    .filter((x) => x.end > x.start);

  const layout = computeOverlapLayout(boxes);
  layout.forEach((pos, id) => overlapPosById.set(id, pos));
}

                return (
                  <div key={day.toISOString()} className="card print-day" style={{ padding: 12 }}>
                    <div className="day-header" style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
                      {day.toLocaleDateString("de-DE", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>

                    <div className="print-wrap" style={{ overflowX: "auto", width: "100%" }}>
                    <div
                      className="print-grid"
                      style={{
                        display: "grid",
                        minWidth: 78 + visiblePitchesForList.length * 260,
                        width: "max-content",
                        gridTemplateColumns: `78px repeat(${visiblePitchesForList.length}, minmax(260px, 1fr))`,
                        gridTemplateRows: `36px repeat(${listSlots.length}, 28px)`,
                        gap: 4,
                      }}
                    >
                      {/* Header */}
                      <div />
                      {visiblePitchesForList.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            fontWeight: 800,
                            fontSize: 13,
                            opacity: 0.9,
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 12,
                            padding: "8px 10px",
                            background: "rgba(255,255,255,0.04)",
                          }}
                        >
                          {p.name}
                        </div>
                      ))}

                      {/* Time column */}
                      {listSlots.map((s) => (
                        <div
                          key={s.label}
                          style={{
                            gridColumn: 1,
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 12,
                            padding: "6px 8px",
                            fontSize: 12,
                            opacity: 0.85,
                            background: "rgba(255,255,255,0.03)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {s.label}
                        </div>
                      ))}

                      {/* Empty grid cells */}
                      {visiblePitchesForList.map((p, pi) =>
                        listSlots.map((s, si) => (
                          <div
                            key={`${p.id}-${s.label}`}
                            style={{
                              gridColumn: 2 + pi,
                              gridRow: 2 + si,
                              // Option 1: freie Slots "unsichtbar" – keine Boxen, nur eine zarte Linie
                              border: "none",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 0,
                              background: "transparent",
                            }}
                          />
                        ))
                      )}

                      {/* Booking blocks */}
                      {dayBookings.map((b) => {
                        const pIndex = visiblePitchesForList.findIndex((p) => p.id === b.pitch_id);
                        if (pIndex < 0) return null;

                        const bsRaw = new Date(b.start_at);
                        const beRaw = new Date(b.end_at);

                        // clamp to visible hours
                        const minT = new Date(dayStart.getTime() + LIST_START_HOUR * 60 * 60 * 1000);
                        const maxT = new Date(dayStart.getTime() + LIST_END_HOUR * 60 * 60 * 1000);
                        const bs = clamp(bsRaw, minT, maxT);
                        const be = clamp(beRaw, minT, maxT);
                        if (be <= bs) return null;

                        const startIdx = Math.max(0, Math.min(listSlots.length - 1, slotIndex(bs)));
                        const endIdx = Math.max(startIdx + 1, Math.min(listSlots.length, slotIndex(be) + 1));

                        const status = String(b.status || "").toUpperCase();
                        const bg = status === "APPROVED" ? "rgba(40, 160, 80, 0.25)" : "rgba(210, 160, 0, 0.20)";
                        const border =
                          status === "APPROVED" ? "rgba(40, 160, 80, 0.55)" : "rgba(210, 160, 0, 0.45)";

                        const pName = b.pitches?.name ?? pitchById.get(b.pitch_id)?.name ?? "";
                        const tName = b.teams?.name ?? teamById.get(b.team_id)?.name ?? "—";
                        const title = `${pName}`.trim();
                        const timeLabel = `${fmtTime(b.start_at)}–${fmtTime(b.end_at)}`;


const pos = overlapPosById.get(b.id) ?? { colIndex: 0, colCount: 1 };
const gapPx = 6;
const w =
  pos.colCount > 1
    ? `calc((100% - ${(pos.colCount - 1) * gapPx}px) / ${pos.colCount})`
    : "100%";
const ml =
  pos.colCount > 1
    ? `calc(${pos.colIndex} * (((100% - ${(pos.colCount - 1) * gapPx}px) / ${pos.colCount}) + ${gapPx}px))`
    : "0px";

return (
                          <div
                            key={b.id}
                            className="print-event"
                            title={`${timeLabel}\n${tName}\n${title}`}
                            style={{
                              gridColumn: 2 + pIndex,
                              gridRowStart: 2 + startIdx,
                              gridRowEnd: 2 + endIdx,
                              zIndex: 3,
                              borderRadius: 12,
                              border: `1px solid ${border}`,
                              background: bg,
                              padding: "8px 10px",
                              width: w,
                              marginLeft: ml,
                              overflow: "hidden",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              fontSize: 13,
                            }}
                          >
                            <div style={{ fontWeight: 900, marginBottom: 2 }}>{tName}</div>
                            <div style={{ opacity: 0.9, fontSize: 12 }}>{timeLabel}</div>
                            {title && <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>{title}</div>}
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                );
              })}

              {listDays.length === 0 && <div style={{ opacity: 0.8 }}>Bitte Zeitraum wählen.</div>}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {tip.show && (
          <div
            style={{
              position: "fixed",
              left: tip.x,
              top: tip.y,
              zIndex: 9999,
              width: 360,
              maxWidth: "calc(100vw - 20px)",
              background: "rgba(10, 20, 30, 0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 10,
              fontSize: 13,
              lineHeight: 1.25,
              whiteSpace: "pre-wrap",
              pointerEvents: "none",
            }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}