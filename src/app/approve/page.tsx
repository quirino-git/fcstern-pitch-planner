"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

type Booking = {
  id: string;
  created_at: string;
  start_at: string;
  end_at: string;
  status: string;
  note: string | null;
  team_id: string;
  pitch_id: string;
  created_by: string | null;
  updated_at?: string | null;
};

type Team = { id: string; name: string; age_u: number };
type Pitch = { id: string; name: string; type: "GROSSFELD" | "KOMPAKT" };

type Audit = {
  booking_id: string;
  action: string;
  created_at: string;
};

function fmt(dt: string | null | undefined) {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE");
}

export default function ApprovePage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [decisionByBookingId, setDecisionByBookingId] = useState<Map<string, string>>(new Map());

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const role = (profile?.role || "TRAINER").toUpperCase();
  const isAdmin = role === "ADMIN";

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

      if (profErr) console.error(profErr);
      setProfile((prof ?? null) as Profile | null);
      setSessionChecked(true);
    })();
  }, []);

  async function loadAll() {
    setError(null);

    const [b, t, p] = await Promise.all([
      supabase
        .from("bookings")
        .select("id,created_at,start_at,end_at,status,note,team_id,pitch_id,created_by,updated_at")
        .order("created_at", { ascending: false }), // ✅ Eingangsdatum: neueste oben
      supabase.from("teams").select("id,name,age_u").order("age_u").order("name"),
      supabase.from("pitches").select("id,name,type").order("name"),
    ]);

    if (b.error) return setError(b.error.message);
    if (t.error) return setError(t.error.message);
    if (p.error) return setError(p.error.message);

    const rows = (b.data ?? []) as Booking[];
    setBookings(rows);
    setTeams((t.data ?? []) as Team[]);
    setPitches((p.data ?? []) as Pitch[]);

    // ✅ Entscheidungsdatum aus booking_audit holen (letzter APPROVED/REJECTED Eintrag)
    const ids = rows.map((x) => x.id);
    if (ids.length === 0) {
      setDecisionByBookingId(new Map());
      return;
    }

    const { data: audits, error: aErr } = await supabase
      .from("booking_audit")
      .select("booking_id,action,created_at")
      .in("booking_id", ids)
      .in("action", ["APPROVED", "REJECTED"])
      .order("created_at", { ascending: false });

    if (aErr) {
      // Falls Audit nicht erreichbar ist, lassen wir die Spalte leer (kein Hard-Fail).
      console.warn("booking_audit not available:", aErr.message);
      setDecisionByBookingId(new Map());
      return;
    }

    const map = new Map<string, string>();
    for (const a of (audits ?? []) as Audit[]) {
      // weil DESC sortiert: erstes Vorkommen pro booking_id ist das neueste
      if (!map.has(a.booking_id)) map.set(a.booking_id, a.created_at);
    }
    setDecisionByBookingId(map);
  }

  useEffect(() => {
    if (!sessionChecked) return;
    loadAll();

    const channel = supabase
      .channel("approve-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_audit" }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionChecked]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const pitchById = useMemo(() => new Map(pitches.map((p) => [p.id, p])), [pitches]);

async function setStatus(bookingId: string, newStatus: "APPROVED" | "REJECTED") {
  if (!isAdmin) return;

  setBusyId(bookingId);
  setError(null);

  // ✅ Sofort im UI anzeigen (optimistic)
  setBookings((prev) =>
    prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
  );

  try {
    const { data: s } = await supabase.auth.getSession();
    const userId = s.session?.user.id;
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: newStatus, updated_by: userId })
      .eq("id", bookingId);

    if (error) {
      // ❌ Rollback wenn Fehler
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "REQUESTED" } : b))
      );
      setError(error.message);
      return;
    }

    // ✅ Garantiert aktuell: Hol nochmal alles + Audit/DecisionDate
    await loadAll();
  } finally {
    setBusyId(null);
  }
}

  if (!sessionChecked) return null;

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
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
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {isAdmin ? "Genehmigungen" : "Genehmigungen (nur Ansicht)"}
          </div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Rolle: {role}</div>
        </div>

        <Link
          href="/calendar"
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #273243", textDecoration: "none" }}
        >
          ← zurück zum Kalender
        </Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #273243" }}>
              <th style={{ padding: "10px 8px" }}>Eingang</th>
              <th style={{ padding: "10px 8px" }}>Platz</th>
              <th style={{ padding: "10px 8px" }}>Team</th>
              <th style={{ padding: "10px 8px" }}>Von</th>
              <th style={{ padding: "10px 8px" }}>Bis</th>
              <th style={{ padding: "10px 8px" }}>Status</th>
              <th style={{ padding: "10px 8px" }}>Notiz</th>
              {isAdmin && <th style={{ padding: "10px 8px" }}>Aktion</th>}
              <th style={{ padding: "10px 8px" }}>Entscheidung</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((b) => {
              const team = teamById.get(b.team_id);
              const pitch = pitchById.get(b.pitch_id);
              const status = String(b.status || "").toUpperCase();

              const decisionDt = decisionByBookingId.get(b.id) ?? ""; // aus Audit
              const canDecide = isAdmin && status === "REQUESTED";

              return (
                <tr key={b.id} style={{ borderBottom: "1px solid rgba(39,50,67,0.6)" }}>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>{fmt(b.created_at)}</td>
                  <td style={{ padding: "10px 8px" }}>{pitch?.name ?? b.pitch_id}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {team ? `${team.name} (U${team.age_u})` : b.team_id}
                  </td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>{fmt(b.start_at)}</td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>{fmt(b.end_at)}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>{status}</td>
                  <td style={{ padding: "10px 8px" }}>{b.note ?? ""}</td>

                  {isAdmin && (
                    <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                      {canDecide ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => setStatus(b.id, "APPROVED")}
                            disabled={busyId === b.id}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #273243",
                              cursor: "pointer",
                            }}
                          >
                            Genehmigen
                          </button>
                          <button
                            onClick={() => setStatus(b.id, "REJECTED")}
                            disabled={busyId === b.id}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #273243",
                              cursor: "pointer",
                            }}
                          >
                            Ablehnen
                          </button>
                        </div>
                      ) : (
                        <span style={{ opacity: 0.6 }}>—</span>
                      )}
                    </td>
                  )}

                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                    {decisionDt ? fmt(decisionDt) : <span style={{ opacity: 0.6 }}>—</span>}
                  </td>
                </tr>
              );
            })}

            {bookings.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} style={{ padding: 12, opacity: 0.7 }}>
                  Keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
