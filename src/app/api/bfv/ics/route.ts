import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOME_FALLBACK_LOCATION =
  "BSA Feldbergstraße, Feldbergstr. 65, 81825 München";

/* =========================
   Basic helpers
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

// Für eure App: nicht falten (kein Zeilenumbruch)
function foldLine(line: string) {
  return [line];
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
   Cleaning helpers
========================= */

function cleanText(s: string) {
  let t = s || "";

  // remove script/style blocks
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // remove common media tags
  t = t.replace(/<img[^>]*>/gi, " ");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  // remove ALL tags (incl. custom elements)
  t = t.replace(/<[^>]*>/g, " ");

  // decode a few entities
  t = t.replace(/&nbsp;|&#160;/gi, " ");
  t = t.replace(/\u00a0/g, " ");

  // If BFV markup got "flattened" (tags stripped upstream), we can end up with
  // chunks like: "data-img-title= FC Stern ... data-module= BfvImage loading= lazy / FC Stern ..."
  // We want to KEEP the visible team name after the slash, but DROP the attribute chunk before it.
  // Remove any "data-img-title= ... /" attribute blocks (non-greedy up to the next slash).
  t = t.replace(/\bdata-img-title\s*=\s*.*?\s*\/\s*/gi, "");

  // Also drop other common flattened attributes that may appear without angle brackets.
  t = t.replace(/\bdata-[a-z0-9_-]+\s*=\s*[^|/]{0,80}/gi, " ");
  t = t.replace(/\b(?:data-module|loading|srcset|sizes|alt|title|aria-[a-z0-9_-]+)\s*=\s*[^|/]{0,80}/gi, " ");
  t = t.replace(/\bBfvImage\b/gi, " ");
  t = t.replace(/\blazy\b/gi, " ");

  // remove leftover angle/quote chars if any remain
  t = t.replace(/[<>\"]/g, " ");

  // normalize roman suffix spacing in team labels (U9- I => U9-I)
  t = t.replace(/\b(U\d{1,2}|U\d{1,2}\s*\(.*?\))\s*-\s*([IVX]{1,4})\b/g, "$1-$2");
  t = t.replace(/\b([A-Za-zÄÖÜäöüß]{2,})\s*-\s*([IVX]{1,4})\b/g, "$1-$2");

  // collapse whitespace
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

function cleanBfvSummary(s: string) {
  let t = cleanText(s)
    .replace(/\s+/g, " ")
    .replace(/^['| -]+/g, "")
    .replace(/['| -]+$/g, "")
    .trim();

  // Remove leading date/time fragments that can slip into the extracted window
  // e.g. "22.02.2026 /10:00 Uhr ..." or ".2026 /10:00 Uhr ..."
  t = t.replace(/^\d{2}\.\d{2}\.\d{4}\s*(?:\/\s*)?\d{1,2}[:.]\d{2}(?:\s*Uhr)?\s*/i, "");
  t = t.replace(/^\.?\d{4}\s*(?:\/\s*)?\d{1,2}[:.]\d{2}(?:\s*Uhr)?\s*/i, "");

  // remove some remaining BFV tokens that can still slip through
  t = t.replace(/\bdata-module\b/gi, "");
  t = t.replace(/\bdata-img-title\b/gi, "");
  // Remove lone roman markers (table/column artifacts) but keep team suffixes like U9-I
  t = t.replace(/\b(?<!U\d{1,2}-)(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();

  // BFV sometimes inserts ' - : - ' as separator; normalize
  t = t.replace(/\s*-\s*:\s*-\s*/g, " - ");
  // Drop any leftover 'Uhr' tokens or leading separators
  t = t.replace(/\bUhr\b/gi, " ");
  t = t.replace(/^\s*[\/\-|]+\s*/g, "");

  // Cleanup repeated separators
  // Remove slashes/pipes that BFV uses for layout (we already have separate date/time columns)
  t = t.replace(/[|]/g, " ");
  t = t.replace(/\s*\/\s*/g, " ");
  t = t.replace(/\s*-\s*/g, " - ");
  t = t.replace(/\s{2,}/g, " ").trim();

  return t;
}

function uidFrom(summary: string, start: Date) {
  const key = `${start.toISOString()}|${summary}`;
  return crypto.createHash("sha1").update(key).digest("hex");
}

/* =========================
   Auto-moreUrl
========================= */

function extractTeamIdFromBfvTeamUrl(teamUrl: string): string | "" {
  const m = teamUrl.match(/\/([0-9A-Z]{24,32})\/?$/);
  return m ? m[1] : "";
}

function buildDefaultMoreUrl(teamId: string) {
  return `https://www.bfv.de/partial/mannschaftsprofil/spielplan/${teamId}/naechste?wettbewerbsart=1&spieltyp=ALLE&from=0&size=5`;
}

/* =========================
   Location logic
========================= */

function normalizeSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function isFestival(summary: string) {
  return /kinderfestival/i.test(summary);
}

function stripDiacritics(input: string) {
  // NFD splits accents into separate code points; then we drop the marks
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTeamName(input: string) {
  let t = stripDiacritics(input || "").toLowerCase();
  // unify separators
  t = t.replace(/[\u2010-\u2015]/g, "-");
  // "U8-I" and "U8 - I" should match
  t = t.replace(/\bu(\d{1,2})\s*[- ]\s*i\b/g, "u$1 i");
  t = t.replace(/\bu(\d{1,2})\s*[- ]\s*ii\b/g, "u$1 ii");
  t = t.replace(/\bu(\d{1,2})\s*[- ]\s*iii\b/g, "u$1 iii");
  // keep letters/numbers, turn everything else into spaces
  t = t.replace(/[^a-z0-9]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function teamNameFromBfvTeamUrl(teamUrl: string): string {
  try {
    const u = new URL(teamUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    // .../mannschaften/<slug>/<id>
    const idx = parts.findIndex((p) => p === "mannschaften");
    const slug = idx >= 0 ? parts[idx + 1] : parts[parts.length - 2];
    if (!slug) return "";
    return slug.replace(/-/g, " ");
  } catch {
    // url might already be decoded or without protocol
    const m = teamUrl.match(/\/mannschaften\/([^\/]+)\//);
    return m ? m[1].replace(/-/g, " ") : "";
  }
}

function isHomeGame(summary: string, teamHint: string) {
  const parts = summary.split(" - ");
  if (parts.length < 2) return false;

  const host = parts[0];
  const hostN = normalizeTeamName(host);
  const teamN = normalizeTeamName(teamHint);

  if (!teamN) return false;
  // allow partial matches because BFV sometimes expands/shortens names
  return (
    hostN === teamN ||
    hostN.startsWith(teamN) ||
    teamN.startsWith(hostN) ||
    hostN.includes(teamN) ||
    teamN.includes(hostN)
  );
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
   Parse
========================= */

type ParsedEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location: string;
};

function parseAllFromHtml(html: string, teamUrl: string) {
  const teamHint = teamNameFromBfvTeamUrl(teamUrl);
  const events: ParsedEvent[] = [];
  const seen = new Set<string>();

  const re =
    /(\d{2})\.(\d{2})\.(\d{4})[^0-9]{0,120}(\d{1,2})[:.](\d{2})(?:\s*Uhr)?/gi;

  let m: RegExpExecArray | null;
  let matches = 0;
  let skippedSeasonHistory = 0;
  let skippedDupes = 0;

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

    let summary = cleanBfvSummary(afterTime);
    if (!summary) {
      summary = cleanBfvSummary(textWindow.slice(0, 220));
      if (!summary) continue;
    }

    const sumLower = summary.toLowerCase();

    // saison/historie raus (keine echten Spiele)
    if (sumLower.includes("historie") || sumLower.includes("saison")) {
      skippedSeasonHistory++;
      continue;
    }

    const uid = uidFrom(summary, start);
    if (seen.has(uid)) {
      skippedDupes++;
      continue;
    }
    seen.add(uid);

    const end = addMinutes(start, 90);

    const summaryClean = cleanBfvSummary(summary);
    const home = isHomeGame(summaryClean, teamHint);
    const festival = isFestival(summaryClean);

    let location = extractLocationFromTextWindow(textWindow);

    if (!location) {
      if (home) location = HOME_FALLBACK_LOCATION;
      else location = "Auswärts";
    }

    // aktuell kein Festival-Filter, nur Markierung möglich
    void festival;

    events.push({ uid, start, end, summary: summaryClean, location });
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    events,
    matches,
    hasUhr: /Uhr/i.test(html),
    skippedSeasonHistory,
    skippedDupes,
  };
}

/* =========================
   “Mehr anzeigen” loader
========================= */

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
   ICS build
========================= */

function buildIcs(events: ParsedEvent[]) {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//FCSternPitchPlanner//BFV HTML to ICS (AUTO_MORE+CLEAN)//DE");
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

  // Passthrough für echte ICS Links
  if (looksLikeIcs(text)) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  // Auto-moreUrl (wenn UI es nicht mitschickt)
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

  const parsed = parseAllFromHtml(combinedHtml, u.toString());

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
      events: parsed.events.length,
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
