"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function pickRedirectTarget(type: string | null) {
  const t = (type ?? "").toLowerCase();
  // recovery/invite => Passwort setzen
  if (t === "recovery" || t === "invite") return "/reset-password";
  // alles andere => Kalender
  return "/calendar";
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState("Verarbeite Login-Link…");

  useEffect(() => {
    (async () => {
      try {
        // 1) Type aus URL/Hash lesen (wichtig: auch wenn Session schon existiert!)
        const url = new URL(window.location.href);
        const typeFromQuery = url.searchParams.get("type");

        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        const typeFromHash = hash.get("type");

        const finalType = typeFromQuery ?? typeFromHash;

        // 2) Falls "code" vorhanden (PKCE), Session austauschen
        const code = url.searchParams.get("code");
        if (code) {
          setStatus("Session wird erstellt…");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          window.location.href = pickRedirectTarget(finalType);
          return;
        }

        // 3) Session prüfen (für Hash-Token oder bereits vorhandene Session)
        setStatus("Session prüfen…");
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          window.location.href = pickRedirectTarget(finalType);
          return;
        }

        // 4) Fallback
        window.location.href = "/login";
      } catch (e: any) {
        console.error(e);
        window.location.href = "/login";
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 520, margin: "48px auto", padding: 16 }}>
      <div className="card">
        <h1>Bitte warten…</h1>
        <p style={{ opacity: 0.8 }}>{status}</p>
      </div>
    </div>
  );
}
