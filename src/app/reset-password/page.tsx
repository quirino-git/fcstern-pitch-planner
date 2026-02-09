"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Prüfen ob wir in einer Recovery/Reset Session sind
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setErr("Kein gültiger Reset-Link / keine Session gefunden.");
      }
    })();
  }, []);

  async function setNewPassword() {
    setErr(null);
    setMsg(null);

    if (pw1.length < 6) return setErr("Passwort ist zu kurz (mindestens 6 Zeichen).");
    if (pw1 !== pw2) return setErr("Passwörter stimmen nicht überein.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);

    if (error) return setErr(error.message);
    setMsg("Passwort wurde gesetzt. Du wirst zum Kalender weitergeleitet…");
    setTimeout(() => (window.location.href = "/calendar"), 800);
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Neues Passwort setzen</h1>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>
          Neues Passwort
          <input value={pw1} onChange={(e) => setPw1(e.target.value)} type="password" />
        </label>

        <label>
          Passwort wiederholen
          <input value={pw2} onChange={(e) => setPw2(e.target.value)} type="password" />
        </label>

        <button onClick={setNewPassword} disabled={loading}>
          {loading ? "Bitte warten…" : "Passwort speichern"}
        </button>

        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {msg && <div style={{ color: "#9bdcff" }}>{msg}</div>}
      </div>
    </div>
  );
}
