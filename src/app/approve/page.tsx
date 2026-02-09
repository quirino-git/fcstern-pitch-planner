"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  note: string | null;
  team_id: string;
  pitch_id: string;
};

type Pitch = { id: string; name: string };
type Team = { id: string; name: string };

export default function ApprovePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pitchName = (id: string) => pitches.find((p) => p.id === id)?.name ?? "Platz";
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "Team";

  async function load() {
    setError(null);
    const [p, t, b] = await Promise.all([
      supabase.from("pitches").select("id,name"),
      supabase.from("teams").select("id,name"),
      supabase.from("bookings").select("id,start_at,end_at,status,note,team_id,pitch_id").eq("status", "REQUESTED").order("start_at"),
    ]);

    if (p.error) return setError(p.error.message);
    if (t.error) return setError(t.error.message);
    if (b.error) return setError(b.error.message);

    setPitches(p.data ?? []);
    setTeams(t.data ?? []);
    setRows((b.data ?? []) as Row[]);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) window.location.href = "/login";
      await load();
    })();
  }, []);

  async function setStatus(id: string, status: string) {
    setError(null);
    const { data: s } = await supabase.auth.getSession();
    const userId = s.session?.user.id;
    if (!userId) return (window.location.href = "/login");

    const { error } = await supabase
      .from("bookings")
      .update({ status, updated_by: userId })
      .eq("id", id);

    if (error) setError(error.message);
    else load();
  }

  return (
    <div style={{ maxWidth: 1000, margin: "20px auto", padding: 16 }}>
      <h1>Genehmigungen</h1>
      <p><a href="/calendar">← zurück zum Kalender</a></p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {rows.length === 0 ? (
        <p>Keine offenen Anträge (REQUESTED).</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Zeit</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Team</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Platz</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Notiz</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: 8 }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 8 }}>
                  {new Date(r.start_at).toLocaleString()} – {new Date(r.end_at).toLocaleTimeString()}
                </td>
                <td style={{ padding: 8 }}>{teamName(r.team_id)}</td>
                <td style={{ padding: 8 }}>{pitchName(r.pitch_id)}</td>
                <td style={{ padding: 8 }}>{r.note ?? ""}</td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  <button onClick={() => setStatus(r.id, "APPROVED")}>Genehmigen</button>{" "}
                  <button onClick={() => setStatus(r.id, "REJECTED")}>Ablehnen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
