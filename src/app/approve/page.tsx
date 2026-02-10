"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type BookingRow = {
  id: string;
  created_at?: string | null; // falls vorhanden
  created_by?: string | null;
  team_id: string;
  pitch_id: string;
  start_at: string;
  end_at: string;
  status: string;
  note: string | null;
};

type Pitch = { id: string; name: string };
type Team = { id: string; name: string; age_u: number };

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

function fmtDE(dt: string) {
  try {
    return new Date(dt).toLocaleString("de-DE");
  } catch {
    return dt;
  }
}

export default function ApprovePage() {
  const [sessionChecked, setSessionChecked] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rows, setRows] = useState<BookingRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = useMemo(() => (profile?.role || "TRAINER").toUpperCase() === "ADMIN", [profile]);

  // Session + Profil
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

  async function loadAll() {
    setError(null);

    const [p, t, b] = await Promise.all([
      supabase.from("pitches").select("id,name").order("name"),
      supabase.from("teams").select("id,name,age_u").order("age_u").order("name"),
      supabase
        .from("bookings")
        .select("id,created_at,created_by,team_id,pitch_id,start_at,end_at,status,note")
        .order("created_at", { ascending: false })
        .order("start_at", { ascending: false }),
    ]);

    if (p.error) return setError(p.error.message);
    if (t.error) return setError(t.error.message);
    if (b.error) return setError(b.error.message);

    setPitches((p.data ?? []) as Pitch[]);
    setTeams((t.data ?? []) as Team[]);
    setRows((b.data ?? []) as BookingRow[]);
  }

  useEffect(() => {
    if (!sessionChecked) return;
    loadAll();

    const ch = supabase
      .channel("bookings-approve-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionChecked]);

  const pitchById = useMemo(() => new Map(pitches.map((x) => [x.id, x.name])), [pitches]);
  const teamById = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);

  async function setStatus(id: string, status: string) {
    if (!isAdmin) return;

    setError(null);
    setBusyId(id);

    try {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);

      if (error) {
        const msg = String(error.message || "");

        // ✅ verständliche Meldung bei Overlap Constraint
        if (msg.includes("bookings_no_overlap") || msg.toLowerCase().includes("exclusion constraint")) {
          setError(
            "Der Slot ist inzwischen belegt (Überschneidung). Bitte Terminzeit ändern oder den anderen Termin prüfen."
          );
          return;
        }

        throw error;
      }

      // sofort sichtbar (optimistic)
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

      // und einmal sicher reloaden
      await loadAll();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Fehler beim Speichern.");
    } finally {
      setBusyId(null);
    }
  }

  if (!sessionChecked) return null;

  const role = (profile?.role || "TRAINER").toUpperCase();
  const canEdit = isAdmin;

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16 }}>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {isAdmin ? "Genehmigen" : "Genehmigungen"} (Historie)
          </div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Rolle: {role}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/calendar" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #273243" }}>
            ← Kalender
          </Link>
          <button onClick={loadAll} style={{ padding: "8px 10px" }}>
            Aktualisieren
          </button>
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Eingang</th>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Platz</th>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Team</th>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Von</th>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Bis</th>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Status</th>
              <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Notiz</th>
              {canEdit && <th style={{ padding: 10, borderBottom: "1px solid #273243" }}>Aktion</th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const pitch = pitchById.get(r.pitch_id) ?? r.pitch_id;
              const team = teamById.get(r.team_id);
              const teamText = team ? `${team.name} (U${team.age_u})` : r.team_id;

              const status = String(r.status || "").toUpperCase();
              const incoming = r.created_at ? fmtDE(r.created_at) : fmtDE(r.start_at);
              const busy = busyId === r.id;

              return (
                <tr key={r.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{incoming}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{pitch}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{teamText}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{fmtDE(r.start_at)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{fmtDE(r.end_at)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{status}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)", maxWidth: 360 }}>
                    {r.note ?? "—"}
                  </td>

                  {canEdit && (
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {status === "REQUESTED" ? (
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "nowrap",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button disabled={busy} onClick={() => setStatus(r.id, "APPROVED")}>
                            Genehmigen
                          </button>
                          <button disabled={busy} onClick={() => setStatus(r.id, "REJECTED")}>
                            Ablehnen
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "nowrap",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button disabled={busy} onClick={() => setStatus(r.id, "REQUESTED")}>
                            Zurück auf Angefragt
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} style={{ padding: 14, opacity: 0.8 }}>
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
