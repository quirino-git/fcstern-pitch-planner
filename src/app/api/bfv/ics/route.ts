import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOME_FALLBACK_LOCATION =
  "BSA Feldbergstraße, Feldbergstr. 65, 81825 München";

/* =========================
   Security / fetch helpers
========================= */

function isAllowedHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "service.bfv.de" ||
    h === "bfv.de" ||
    h.endsWith(".bfv.de") ||
    h === "app.bfv.de" ||
    h.endsWith(".app.bfv.de")
  );
}

function looksLikeIcs(text: string) {
  return /BEGIN:VCALENDAR/i.test(text);
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
      accept: "text/html,*/*",
    },
    cache: "no-store",
    redirect: "follow",
  });

  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

/* =========================
   Small utils
========================= */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatIcsLocal(dt: Date) {
  return (
    dt.getFullYear() +
    pad(dt.getMonth() + 1) +
    pad(dt.getDate()) +
    "T" +
    pad(dt.getHours()) +
    pad(dt.getMinutes()) +
    "00"
  );
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function escapeIcsValue(s: string) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// For your GUI: do NOT fold lines (some parsers/UI get weird)
function foldLine(line: string) {
  return [line];
}

function uidFrom(summary: string, start: Date) {
  const key = `${start.toISOString()}|${summary}`;
  return crypto.createHash("sha1").update(key).digest("hex");
}

/* =========================
   Text cleaning
========================= */

function cleanText(s: string) {
  let t = s || "";

  // Remove scripts/styles
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Remove svg blocks
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  // Convert tags to spaces
  t = t.replace(/<[^>]*>/g, " ");

  // HTML entities & nbsp
  t = t.replace(/&nbsp;|&#160;/gi, " ");
  t = t.replace(/\u00a0/g, " ");

  // Collapse spaces
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

function cleanBfvSummary(s: string) {
  let t = cleanText(s);

  // Kill BFV image-component attribute garbage that sometimes leaks into text windows
  t = t.replace(/\bdata-[a-z0-9_-]+\s*=\s*[^\s]+\b/gi, " ");
  t = t.replace(/\bloading\s*=\s*[^\s]+\b/gi, " ");
  t = t.replace(/\bdata-module\s*=\s*[^\s]+\b/gi, " ");
  t = t.replace(/\bBfvImage\b/gi, " ");

  // Remove stray pipes/slashes that appear from layout
  t = t.replace(/[|]/g, " ");
  t = t.replace(/\s+\/\s+/g, " - ");
  t = t.replace(/\s+/g, " ").trim();

  // Normalize dash variants a bit
  t = t.replace(/[–—]/g, "-").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();

  // Trim leading junk
  t = t.replace(/^[-\s:]+/g, "").trim();

  return t;
}

/* =========================
   Auto "Mehr anzeigen" / partial loader
========================= */

function extractTeamIdFromBfvTeamUrl(teamUrl: string): string | "" {
  const m = teamUrl.match(/\/([0-9A-Z]{24,32})\/?$/);
  return m ? m[1] : "";
}

function buildDefaultMoreUrl(teamId: string) {
  return `https://www.bfv.de/partial/mannschaftsprofil/spielplan/${teamId}/naechste?wettbewerbsart=1&spieltyp=ALLE&from=0&size=5`;
}

function setFrom(url: string, from: number) {
  const u = new URL(url);
  u.searchParams.set("from", String(from));
  return u.toString();
}

async function loadBfvPartialSpielplanAll(moreUrl: string, maxPages = 12) {
  const u0 = new URL(moreUrl);
  const size = Number(u0.searchParams.get("size") || "5") || 5;

  const parts: string[] = [];
  const seenHashes = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const from = page * size;
    const url = setFrom(moreUrl, from);

    const { ok, text } = await fetchText(url);
    if (!ok || !text || text.length < 50) break;

    const h = crypto.createHash("sha1").update(text).digest("hex");
    if (seenHashes.has(h)) break;
    seenHashes.add(h);

    parts.push(text);
  }

  return parts.join("\n");
}

/* =========================
   Robust team matching (fixes FC Stern issues)
========================= */

function normalizeText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamKeyFromTeamUrl(teamUrl: string) {
  let slug = "";
  try {
    const u = new URL(teamUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    const i = segs.findIndex((p) => p === "mannschaften");
    if (i >= 0) slug = segs[i + 1] || "";
  } catch {
    // ignore
  }

  // Remove trailing roman suffix in slug (…-u9-i, …-u8-ii, …-u9-1 etc.)
  slug = slug.replace(/-(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i, "");

  return normalizeText(slug);
}

function tokensFromTeamKey(teamKey: string) {
  const stop = new Set(["fc", "sv", "tsv", "sc", "spvgg", "sg", "dj", "u"]);
  const toks = normalizeText(teamKey)
    .split(" ")
    .filter(Boolean)
    .filter((t) => t.length >= 2 && !stop.has(t));

  // Prefer club + uXX if present
  return toks;
}

function containsEnoughTokens(text: string, teamKey: string) {
  const t = normalizeText(text);
  const toks = tokensFromTeamKey(teamKey);

  if (toks.length === 0) return false;

  const hits = toks.filter((tok) => t.includes(tok));
  // Require at least 2 hits (or all if only 1 token)
  const need = toks.length === 1 ? 1 : 2;
  return hits.length >= need;
}

/* =========================
   Location extraction
========================= */

function normalizeSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function looksLikeAddress(text: string) {
  return (
    /\bstr\.?\b|\bstraße\b|\bweg\b|\bplatz\b|\ballee\b/i.test(text) &&
    (/\b\d{5}\b/.test(text) || /\b\d{1,4}\b/.test(text))
  );
}

function extractLocationFromTextWindow(textWindow: string): string {
  const t = normalizeSpaces(textWindow);

  const m1 = t.match(
    /((?:BSA|Sportanlage|Sportzentrum|Stadion|Platz|Anlage)[^,]{0,90})(?:,?\s*)([^,]{0,160}?(?:straße|str\.|weg|allee|platz)\s*\d{1,4}[^,]{0,80}\s*\b\d{5}\b\s*[A-Za-zÄÖÜäöüß\- ]{2,})/i
  );
  if (m1) return normalizeSpaces(`${m1[1]}, ${m1[2]}`);

  const m2 = t.match(
    /([A-Za-zÄÖÜäöüß0-9 \-]{3,80}(?:straße|str\.|weg|allee|platz)\s*\d{1,4}[^,]{0,60}\s*\b\d{5}\b\s*[A-Za-zÄÖÜäöüß\- ]{2,})/i
  );
  if (m2) return normalizeSpaces(m2[1]);

  const plz = t.match(/\b\d{5}\b/);
  if (plz) {
    const idx = t.indexOf(plz[0]);
    const slice = t.slice(Math.max(0, idx - 120), Math.min(t.length, idx + 120));
    if (looksLikeAddress(slice)) return normalizeSpaces(slice);
  }

  return "";
}

/* =========================
   Home/Away extraction
========================= */

function isFestival(summaryClean: string) {
  return /kinderfestival/i.test(summaryClean);
}

function extractHostTeam(summaryClean: string) {
  const s = summaryClean.replace(/[–—]/g, "-");

  // Kinderfestival: keep "U8 - I" intact by cutting at " - Kinderfestival"
  const mf = s.match(/^(.*?)\s*-\s*kinderfestival\b/i);
  if (mf && mf[1]) return mf[1].trim();

  // Normal matches often contain " - : - " as delimiter between home/away
  const mm = s.match(/^(.*?)\s*-\s*:\s*-\s*(.*)$/);
  if (mm && mm[1]) return mm[1].trim();

  // Fallback: first chunk
  const parts = s.split(" - ");
  return (parts[0] || s).trim();
}

function isHomeGame(summaryClean: string, teamKey: string) {
  const host = extractHostTeam(summaryClean);
  return containsEnoughTokens(host, teamKey);
}

/* =========================
   Parsing
========================= */

type ParsedEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location: string;
};

function parseAllFromHtml(html: string, teamUrl: string) {
  const events: ParsedEvent[] = [];
  const seen = new Set<string>();

  const teamKey = teamKeyFromTeamUrl(teamUrl);

  const re =
    /(\d{2})\.(\d{2})\.(\d{4})[^0-9]{0,120}(\d{1,2})[:.](\d{2})(?:\s*Uhr)?/gi;

  let m: RegExpExecArray | null;
  let matches = 0;
  let skippedSeasonHistory = 0;
  let skippedDupes = 0;
  let skippedAbgesetzt = 0;

  while ((m = re.exec(html)) !== null) {
    matches++;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mi = Number(m[5]);

    const start = new Date(yyyy, mm - 1, dd, hh, mi, 0);

    const windowHtml = html.slice(m.index, Math.min(html.length, m.index + 5200));
    const textWindow = cleanText(windowHtml);

    const afterTime = textWindow
      .replace(/^.*?\d{1,2}[:.]\d{2}(?:\s*Uhr)?/i, "")
      .replace(/Zum Spiel.*$/i, "")
      .trim();

    let summaryRaw = cleanBfvSummary(afterTime);
    if (!summaryRaw) {
      summaryRaw = cleanBfvSummary(textWindow.slice(0, 240));
      if (!summaryRaw) continue;
    }

    const sumLower = summaryRaw.toLowerCase();

    // Skip season/history blocks
    if (sumLower.includes("historie") || sumLower.includes("saison")) {
      skippedSeasonHistory++;
      continue;
    }

    // Optional: skip abgesetzt (you said it's fine to keep, but it helps)
    if (sumLower.includes("abgesetzt")) {
      skippedAbgesetzt++;
      continue;
    }

    const uid = uidFrom(summaryRaw, start);
    if (seen.has(uid)) {
      skippedDupes++;
      continue;
    }
    seen.add(uid);

    const end = addMinutes(start, 90);

    const summary = summaryRaw;

    const festival = isFestival(summary);
    void festival; // for future use

    const home = isHomeGame(summary, teamKey);

    let location = extractLocationFromTextWindow(textWindow);

    if (!location) {
      if (home) location = HOME_FALLBACK_LOCATION;
      else location = "Auswärts";
    }

    events.push({ uid, start, end, summary, location });
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    events,
    matches,
    hasUhr: /Uhr/i.test(html),
    skippedSeasonHistory,
    skippedDupes,
    skippedAbgesetzt,
    teamKey,
  };
}

/* =========================
   ICS builder
========================= */

function buildIcs(events: ParsedEvent[]) {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//FCSternPitchPlanner//BFV HTML to ICS (ROBUST_HOME)//DE");
  lines.push("CALSCALE:GREGORIAN");

  const dtstamp = formatIcsLocal(new Date());

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(...foldLine(`UID:${escapeIcsValue(e.uid)}`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatIcsLocal(e.start)}`);
    lines.push(`DTEND:${formatIcsLocal(e.end)}`);
    lines.push(...foldLine(`SUMMARY:${escapeIcsValue(e.summary)}`));
    lines.push(...foldLine(`LOCATION:${escapeIcsValue(e.location)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/* =========================
   Route
========================= */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const debug = searchParams.get("debug") === "1";
  const moreUrlParam = searchParams.get("moreUrl") || "";

  if (!url) {
    return NextResponse.json({ error: "Missing url query param" }, { status: 400 });
  }

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (u.protocol !== "https:") {
    return NextResponse.json({ error: "Only https allowed" }, { status: 400 });
  }
  if (!isAllowedHost(u.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const { ok, status, text } = await fetchText(u.toString());
  if (!ok) {
    return NextResponse.json(
      { error: "BFV fetch failed", status, text: (text || "").slice(0, 800) },
      { status: 502 }
    );
  }

  // Passthrough for real ICS
  if (looksLikeIcs(text)) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  // Auto moreUrl
  let moreUrl = moreUrlParam;
  let moreUrlAuto = false;

  if (!moreUrl) {
    const teamId = extractTeamIdFromBfvTeamUrl(u.toString());
    if (teamId) {
      moreUrl = buildDefaultMoreUrl(teamId);
      moreUrlAuto = true;
    }
  }

  let combinedHtml = text;
  let partialLen = 0;

  if (moreUrl) {
    try {
      const mu = new URL(moreUrl);
      if (isAllowedHost(mu.hostname)) {
        const partial = await loadBfvPartialSpielplanAll(moreUrl, 12);
        partialLen = partial.length;
        if (partial) combinedHtml += "\n" + partial;
      }
    } catch {
      // ignore invalid moreUrl
    }
  }

  const teamUrl = u.toString();
  const parsed = parseAllFromHtml(combinedHtml, teamUrl);

  if (debug) {
    return NextResponse.json({
      baseHtmlLen: text.length,
      partialLen,
      combinedHtmlLen: combinedHtml.length,
      hasMoreUrl: Boolean(moreUrl),
      moreUrlAuto,
      matches: parsed.matches,
      hasUhr: parsed.hasUhr,
      skippedSeasonHistory: parsed.skippedSeasonHistory,
      skippedDupes: parsed.skippedDupes,
      skippedAbgesetzt: parsed.skippedAbgesetzt,
      events: parsed.events.length,
      teamKey: parsed.teamKey,
      firstFive: parsed.events.slice(0, 5).map((e) => ({
        summary: e.summary,
        location: e.location,
      })),
    });
  }

  const ics = buildIcs(parsed.events);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}