"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import deLocale from "@fullcalendar/core/locales/de";

import { supabase } from "@/lib/supabaseClient";

type Pitch = { id: string; name: string; type: "GROSSFELD" | "KOMPAKT" };
type Team = { id: string; name: string; age_u: number };

type Booking = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  note: string | null;
  team_id: string;
  pitch_id: string;
  created_by?: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

const STATUS_OPTIONS = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
] as const;

type Status = (typeof STATUS_OPTIONS)[number];

const STATUS_LABELS: Record<Status, string> = {
  REQUESTED: "Angefragt",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
};

function roundToStep(date: Date, stepMinutes: number) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const rounded = Math.round(m / stepMinutes) * stepMinutes;
  d.setMinutes(rounded);
  return d;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function toYMD(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function goToRequestNew(start: Date, end: Date, returnView: string, returnDate: Date) {
  const params = new URLSearchParams({
    start: toLocalInputValue(start),
    end: toLocalInputValue(end),
    returnView,
    returnDate: toYMD(returnDate),
  });
  window.location.href = `/request/new?${params.toString()}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CalendarPage() {
  const [sessionChecked, setSessionChecked] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [pitchFilter, setPitchFilter] = useState<string>("ALL");

  // ✅ Multi-Status (Default: nur REQUESTED+APPROVED)
  const [statusFilter, setStatusFilter] = useState<Status[]>(["REQUESTED", "APPROVED"]);

  // -------------------------
  // Tooltip (Blase)
  // -------------------------
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<{ show: boolean; x: number; y: number; text: string }>({
    show: false,
    x: 0,
    y: 0,
    text: "",
  });

  const lastMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function hideTip() {
    setTip((t) => (t.show ? { ...t, show: false } : t));
  }

  function positionTip(clientX: number, clientY: number, text: string) {
    const padding = 12;
    const offset = 14;

    const el = tooltipRef.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 140;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = clientX + offset;
    let y = clientY + offset;

    x = clamp(x, padding, vw - w - padding);
    y = clamp(y, padding, vh - h - padding);

    setTip({ show: true, x, y, text });
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      lastMouse.current = { x: e.clientX, y: e.clientY };

      const target = e.target as HTMLElement | null;
      const overEvent = !!target?.closest?.(".fc-event");
      if (!overEvent) {
        hideTip();
        return;
      }

      if (!tip.show) return;
      positionTip(e.clientX, e.clientY, tip.text);
    }

    function onScrollOrResize() {
      hideTip();
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [tip.show, tip.text]);

  // -------------------------
  // Status Dropdown (Multi)
  // -------------------------
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!statusOpen) return;
      const t = e.target as Node | null;
      if (t && statusMenuRef.current && !statusMenuRef.current.contains(t)) setStatusOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setStatusOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [statusOpen]);

  function toggleStatus(s: Status) {
    setStatusFilter((prev) => {
      const has = prev.includes(s);
      const next = has ? prev.filter((x) => x !== s) : [...prev, s];
      // Nie leer lassen -> wenn leer, wieder Default setzen
      if (next.length === 0) return ["REQUESTED", "APPROVED"];
      return next;
    });
  }

  function selectDefaults() {
    setStatusFilter(["REQUESTED", "APPROVED"]);
  }
  function selectAll() {
    setStatusFilter([...STATUS_OPTIONS]);
  }

  const statusButtonText = useMemo(() => {
    const labels = statusFilter.map((s) => STATUS_LABELS[s]);
    if (labels.length <= 2) return `Status (${labels.length}): ${labels.join(", ")}`;
    return `Status (${labels.length})`;
  }, [statusFilter]);

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

      setUserEmail(session.user.email ?? null);

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

  async function loadBaseData() {
    setError(null);

    const [p, t] = await Promise.all([
      supabase.from("pitches").select("*").order("name"),
      supabase.from("teams").select("*").order("age_u").order("name"),
    ]);

    if (p.error) return setError(p.error.message);
    if (t.error) return setError(t.error.message);

    setPitches((p.data ?? []) as Pitch[]);
    setTeams((t.data ?? []) as Team[]);
  }

  async function loadBookings(rangeStart: Date, rangeEnd: Date) {
    setError(null);

    const startISO = rangeStart.toISOString();
    const endISO = rangeEnd.toISOString();

    const { data, error } = await supabase
      .from("bookings")
      .select("id,start_at,end_at,status,note,team_id,pitch_id,created_by")
      .gte("start_at", startISO)
      .lt("end_at", endISO);

    if (error) return setError(error.message);
    setBookings((data ?? []) as Booking[]);
  }

  // initial load + realtime
  useEffect(() => {
    if (!sessionChecked) return;

    loadBaseData();

    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    const end = new Date(now);
    end.setDate(now.getDate() + 14);
    loadBookings(start, end);

    const channel = supabase
      .channel("bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        const n = new Date();
        const s = new Date(n);
        s.setDate(n.getDate() - 7);
        const e = new Date(n);
        e.setDate(n.getDate() + 14);
        loadBookings(s, e);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionChecked]);

  const pitchById = useMemo(() => new Map(pitches.map((x) => [x.id, x])), [pitches]);
  const teamById = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);

  const selectedStatusSet = useMemo(() => new Set(statusFilter), [statusFilter]);

  const events = useMemo(() => {
    return bookings
      .filter((b) => (pitchFilter === "ALL" ? true : b.pitch_id === pitchFilter))
      // ✅ zeigt nur die ausgewählten Stati (inkl. REJECTED, falls gewählt)
      .filter((b) => selectedStatusSet.has(String(b.status || "").toUpperCase() as Status))
      .map((b) => {
        const pitch = pitchById.get(b.pitch_id)?.name ?? "Platz";
        const team = teamById.get(b.team_id)?.name ?? "Team";
        const status = String(b.status || "").toUpperCase() as Status;

        const tooltipText = [
          `${pitch} – ${team}`,
          `Status: ${status} (${STATUS_LABELS[status] ?? status})`,
          `Von: ${new Date(b.start_at).toLocaleString("de-DE")}`,
          `Bis: ${new Date(b.end_at).toLocaleString("de-DE")}`,
          b.note ? `Notiz: ${b.note}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          id: b.id,
          title: `${pitch} – ${team} (${status})`,
          start: b.start_at,
          end: b.end_at,
          extendedProps: { status, tooltipText },
        };
      });
  }, [bookings, pitchFilter, pitchById, teamById, selectedStatusSet]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!sessionChecked) return null;

  const role = (profile?.role || "TRAINER").toUpperCase();
  const activeText = profile?.active === false ? "inaktiv" : "aktiv";
  const displayName = (profile?.full_name && profile.full_name.trim()) || userEmail || "User";
  const isAdmin = role === "ADMIN";

  // Restore view + date
  const url = new URL(window.location.href);
  const viewParam = url.searchParams.get("view") || "timeGridWeek";
  const dateParam = url.searchParams.get("date"); // YYYY-MM-DD

  const initialView = viewParam === "dayGridMonth" || viewParam === "timeGridWeek" ? viewParam : "timeGridWeek";
  const initialDate = dateParam ? new Date(`${dateParam}T12:00:00`) : undefined;

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          border: "1px solid #273243",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>FC Stern – Platzbelegung</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            {displayName} • Rolle: {role} • {activeText}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/request/new"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #273243", textDecoration: "none" }}
          >
            + Antrag
          </Link>

          <Link
            href="/approve"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #273243", textDecoration: "none" }}
          >
            {isAdmin ? "Genehmigen" : "Genehmigungen"}
          </Link>

          <button
            onClick={logout}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #273243", cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label>
          Platz:&nbsp;
          <select value={pitchFilter} onChange={(e) => setPitchFilter(e.target.value)}>
            <option value="ALL">Alle</option>
            {pitches.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* ✅ Status Dropdown (schön) */}
        <div ref={statusMenuRef} style={{ position: "relative" }}>
          <div style={{ fontSize: 13, opacity: 0.95, marginBottom: 6 }}>Status</div>

          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #273243",
              background: "#0f1620",
              color: "#e6edf3",
              cursor: "pointer",
              minWidth: 260,
              justifyContent: "space-between",
            }}
          >
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 230 }}>
              {statusButtonText}
            </span>
            <span style={{ opacity: 0.75 }}>{statusOpen ? "▲" : "▼"}</span>
          </button>

          {statusOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                width: 320,
                zIndex: 1000,
                border: "1px solid #273243",
                borderRadius: 12,
                background: "rgba(15,22,32,0.98)",
                boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                padding: 10,
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button type="button" onClick={selectDefaults} style={{ padding: "8px 10px" }}>
                  Default
                </button>
                <button type="button" onClick={selectAll} style={{ padding: "8px 10px" }}>
                  Alle
                </button>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {STATUS_OPTIONS.map((s) => {
                  const checked = statusFilter.includes(s);
                  return (
                    <label
                      key={s}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.02)",
                        cursor: "pointer",
                        opacity: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatus(s)}
                        style={{ width: 16, height: 16 }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                        <span style={{ fontWeight: 700 }}>{STATUS_LABELS[s]}</span>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>{s}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {/* Kalender */}
      <div style={{ marginTop: 16, position: "relative" }}>
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={initialDate}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,dayGridMonth",
          }}
          buttonText={{
            today: "Heute",
            timeGridWeek: "Woche",
            dayGridMonth: "Monat",
          }}
          locale={deLocale}
          firstDay={1}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
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
          // Woche: Drag/Markieren -> Antrag (Mindestdauer 60 Minuten)
          selectable={true}
          selectMirror={true}
          unselectAuto={true}
          selectMinDistance={5}
          select={(arg) => {
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
          // Monat: Klick auf Tag -> Antrag (Default 12:00–13:00)
          dateClick={(arg) => {
            hideTip();
            if (arg.view?.type !== "dayGridMonth") return;

            const start = new Date(arg.date);
            start.setHours(12, 0, 0, 0);
            const end = new Date(start.getTime() + 60 * 60 * 1000);

            goToRequestNew(start, end, "dayGridMonth", start);
          }}
          // Tooltip/Blase
          eventMouseEnter={(info) => {
            const text = String(info.event.extendedProps.tooltipText || info.event.title || "");
            const { x, y } = lastMouse.current;

            setTip({ show: true, x: x + 14, y: y + 14, text });
            requestAnimationFrame(() => positionTip(lastMouse.current.x, lastMouse.current.y, text));
          }}
          eventMouseLeave={() => hideTip()}
        />

        {/* Tooltip Layer */}
        {tip.show && (
          <div
            ref={tooltipRef}
            style={{
              position: "fixed",
              left: tip.x,
              top: tip.y,
              zIndex: 9999,
              whiteSpace: "pre-line",
              background: "rgba(15, 22, 32, 0.98)",
              color: "#e6edf3",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 10,
              padding: "10px 12px",
              maxWidth: 360,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              pointerEvents: "none",
              fontSize: 13,
              lineHeight: 1.35,
            }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}
