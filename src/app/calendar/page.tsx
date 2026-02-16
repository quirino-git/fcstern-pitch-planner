"use client";

import "./calendar.css";

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
  const [viewMode, setViewMode] = useState<"week" | "month" | "list">("week");

  // List view range (von/bis, inkl. Tage)
  const [listFrom, setListFrom] = useState<string>("");
  const [listTo, setListTo] = useState<string>("");

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

  const isAdmin = useMemo(() => (profile?.role || "TRAINER").toUpperCase() === "ADMIN", [profile]);

  if (!sessionChecked) return null;

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16 }}>
      {/* Header */}
      <div
        className="card"
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

      {/* Filter */}
      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="card" style={{ padding: 12, minWidth: 240, maxWidth: 320, position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setPitchPickerOpen((v) => !v);
              setStatusPickerOpen(false);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "1px solid #273243",
              borderRadius: 14,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 900, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Plätze ({pitches.length})</span>
              <span style={{ opacity: 0.75, fontSize: 12 }}>{pitchPickerOpen ? "▲" : "▼"}</span>
            </div>
            <div style={{ opacity: 0.85, marginTop: 2, fontSize: 13 }}>
              {pitchFilterIds.length === pitches.length
                ? "Alle"
                : pitchFilterIds.length === 0
                ? "Keine"
                : `${pitchFilterIds.length} ausgewählt`}
            </div>
          </button>

          {pitchPickerOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                right: 0,
                zIndex: 50,
                background: "rgba(10,14,20,0.98)",
                border: "1px solid #273243",
                borderRadius: 16,
                padding: 12,
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              }}
            >
              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setPitchFilterIds(pitches.map((p) => p.id))}
                  style={{ padding: "8px 10px", borderRadius: 12, fontWeight: 800 }}
                >
                  Alle
                </button>
                <button
                  type="button"
                  onClick={() => setPitchFilterIds([])}
                  style={{ padding: "8px 10px", borderRadius: 12, fontWeight: 800 }}
                >
                  Keine
                </button>
                <button
                  type="button"
                  onClick={() => setPitchPickerOpen(false)}
                  style={{ padding: "8px 10px", borderRadius: 12, fontWeight: 800 }}
                >
                  Schließen
                </button>
              </div>

              <div style={{ maxHeight: 240, overflow: "auto", paddingRight: 6 }}>
                {pitches.map((p) => {
                  const checked = pitchFilterIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        marginBottom: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setPitchFilterIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return Array.from(next);
                          });
                        }}
                      />
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 12, minWidth: 240, maxWidth: 320, position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setStatusPickerOpen((v) => !v);
              setPitchPickerOpen(false);
            }}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "1px solid #273243",
              borderRadius: 14,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 900, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Status ({statusFilter.length})</span>
              <span style={{ opacity: 0.75, fontSize: 12 }}>{statusPickerOpen ? "▲" : "▼"}</span>
            </div>
            <div style={{ opacity: 0.85, marginTop: 2, fontSize: 13 }}>
              {statusFilter.length === 0
                ? "Keine"
                : statusFilter
                    .map((s) =>
                      s === "REQUESTED"
                        ? "Angefragt"
                        : s === "APPROVED"
                        ? "Genehmigt"
                        : s === "REJECTED"
                        ? "Abgelehnt"
                        : "Storniert"
                    )
                    .join(", ")}
            </div>
          </button>

          {statusPickerOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                right: 0,
                zIndex: 50,
                background: "rgba(10,14,20,0.98)",
                border: "1px solid #273243",
                borderRadius: 16,
                padding: 12,
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              }}
            >
              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setStatusFilter(["REQUESTED", "APPROVED"])}
                  style={{ padding: "8px 10px", borderRadius: 12, fontWeight: 800 }}
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"])}
                  style={{ padding: "8px 10px", borderRadius: 12, fontWeight: 800 }}
                >
                  Alle
                </button>
                <button
                  type="button"
                  onClick={() => setStatusPickerOpen(false)}
                  style={{ padding: "8px 10px", borderRadius: 12, fontWeight: 800 }}
                >
                  Schließen
                </button>
              </div>

              {(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"] as BookingStatus[]).map((s) => {
                const label =
                  s === "REQUESTED"
                    ? "Angefragt"
                    : s === "APPROVED"
                    ? "Genehmigt"
                    : s === "REJECTED"
                    ? "Abgelehnt"
                    : "Storniert";
                const checked = statusFilter.includes(s);
                return (
                  <label
                    key={s}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setStatusFilter((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s);
                          else next.delete(s);
                          return Array.from(next) as BookingStatus[];
                        });
                      }}
                    />
                    <span style={{ fontWeight: 700 }}>{label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>{error}</div>}

      {/* Kalender */}
      <div style={{ marginTop: 16, position: "relative" }}>
        {/* View Switcher (rechts oben) */}
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            zIndex: 5,
            display: "flex",
            gap: 8,
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
        </div>

        {viewMode !== "list" ? (
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
                    padding: "10px 12px",
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
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #273243",
                    background: "transparent",
                    color: "#e6edf3",
                  }}
                />
              </div>
              <button onClick={loadListRange} style={{ padding: "10px 14px", borderRadius: 12, fontWeight: 800 }}>
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

                return (
                  <div key={day.toISOString()} className="card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
                      {day.toLocaleDateString("de-DE", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `78px repeat(${visiblePitchesForList.length}, minmax(220px, 1fr))`,
                        gridTemplateRows: `36px repeat(${listSlots.length}, 28px)`,
                        gap: 6,
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
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 12,
                              background: "rgba(255,255,255,0.02)",
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

                        return (
                          <div
                            key={b.id}
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