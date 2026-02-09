"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Wenn schon eingeloggt -> direkt weiter
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) window.location.href = "/calendar";
    })();
  }, []);

  async function signInWithPassword() {
    setErr(null);
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) return setErr(error.message);
    window.location.href = "/calendar";
  }

  async function sendMagicLink() {
    setErr(null);
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback",
      },
    });

    setLoading(false);

    if (error) return setErr(error.message);
    setMsg("Magic-Link wurde gesendet. Bitte Postfach prüfen.");
  }

  async function sendResetPasswordEmail() {
    setErr(null);
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/auth/callback",
    });

    setLoading(false);

    if (error) return setErr(error.message);
    setMsg("Passwort-Reset-Link wurde gesendet. Bitte Postfach prüfen.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Login</h1>
      <p style={{ opacity: 0.85, marginTop: 0 }}>
        Standard: E-Mail + Passwort. Magic-Link ist optional als Backup.
      </p>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>
          E-Mail
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="trainer@verein.de"
            autoComplete="email"
          />
        </label>

        <label>
          Passwort
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
          />
        </label>

        <button onClick={signInWithPassword} disabled={loading || !email || !password}>
          {loading ? "Bitte warten…" : "Einloggen"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={sendResetPasswordEmail}
            disabled={loading || !email}
            style={{ padding: "8px 10px" }}
            title="Schickt dir einen Link, um ein neues Passwort zu setzen"
          >
            Passwort vergessen?
          </button>

          <button
            onClick={sendMagicLink}
            disabled={loading || !email}
            style={{ padding: "8px 10px" }}
            title="Backup: Login per Magic-Link"
          >
            Magic-Link senden
          </button>
        </div>

        <div style={{ fontSize: 13, opacity: 0.8 }}>
          <span>Nach Invite: Nutze zuerst </span>
          <b>„Passwort vergessen?“</b>
          <span>, um dein Passwort zu setzen.</span>
        </div>

        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {msg && <div style={{ color: "#9bdcff" }}>{msg}</div>}

        <div style={{ marginTop: 6, fontSize: 13 }}>
          <Link href="/calendar">Zum Kalender</Link>
        </div>
      </div>
    </div>
  );
}
