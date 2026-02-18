import { NextRequest, NextResponse } from "next/server";

/**
 * BFV ICS proxy/normalizer (service.bfv.de)
 *
 * Supabase stores URLs like:
 *   https://service.bfv.de/rest/icsexport/teammatches/teamPermanentId/<TEAM_PERMANENT_ID>
 * (or webcal://... which we normalize to https://)
 *
 * This route:
 *  - fetches the ICS
 *  - parses VEVENTS
 *  - re-emits a clean UTF-8 ICS (stable encoding + optional field normalization)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type IcsEvent = {
  uid: string;
  start: string; // DTSTART raw
  end: string;   // DTEND raw
  summary: string;
  location: string;
  description: string;
  status: string;
};

function isAllowedHost(host: string) {
  const h = host.toLowerCase();
  return h === "service.bfv.de" || h === "bfv.de" || h.endsWith(".bfv.de");
}

function normalizeSourceUrl(raw: string) {
  const s = (raw || "").trim();
  if (s.startsWith("webcal://")) return "https://" + s.slice("webcal://".length);
  return s;
}

function looksLikeIcs(text: string) {
  return /BEGIN:VCALENDAR/i.test(text) && /BEGIN:VEVENT/i.test(text);
}

/**
 * Normalize newlines to \n and unfold RFC5545 folded lines.
 * Folded lines are CRLF + space/tab, or LF + space/tab.
 */
function normalizeAndUnfoldIcs(text: string) {
  const n = (text || "").replace(/\r\n/g, "\n");
  return n.replace(/\n[ \t]/g, "");
}

function icsUnescape(s: string) {
  return (s || "")
    .replace(/\\n/gi, "\n") // keep as newline later? (we return real newlines)
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n");
}

/** Return *real* newline for \n sequences */
function icsUnescapeToText(s: string) {
  return (s || "")
    .replace(/\\n/gi, "\n") // normalize
    .replace(/\\\\/g, "\\")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n")
    .replace(/\\n/gi, "\n");
}

function icsEscape(s: string) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function pickLine(block: string, key: string) {
  const re = new RegExp(`(?:^|\\n)${key}[^:]*:(.*?)(?=\\n[A-Z-]+(?:;|:)|\\nEND:|$)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function parseIcsEvents(icsRaw: string): IcsEvent[] {
  const ics = normalizeAndUnfoldIcs(icsRaw);
  const parts = ics.split("BEGIN:VEVENT").slice(1);

  const events: IcsEvent[] = [];
  for (const p of parts) {
    const block = "BEGIN:VEVENT" + p;
    const uid = pickLine(block, "UID");
    const dtStart = pickLine(block, "DTSTART");
    const dtEnd = pickLine(block, "DTEND");
    if (!dtStart || !dtEnd) continue;

    const summary = icsUnescape(pickLine(block, "SUMMARY"));
    const location = icsUnescape(pickLine(block, "LOCATION"));
    const description = icsUnescape(pickLine(block, "DESCRIPTION"));
    const status = icsUnescape(pickLine(block, "STATUS"));

    events.push({
      uid: uid || `${dtStart}-${summary}`.slice(0, 200),
      start: dtStart,
      end: dtEnd,
      summary,
      location,
      description,
      status,
    });
  }
  return events;
}

function normalizeSummary(summary: string) {
  return (summary || "").replace(/\s+/g, " ").trim();
}

function normalizeLocation(location: string) {
  let s = (location || "").trim();
  s = s
    .replace(/M├╝nchen/g, "München")
    .replace(/Stra├ƒe/g, "Straße")
    .replace(/Feldbergstra├ƒe/g, "Feldbergstraße");
  return s.replace(/\s+/g, " ").trim();
}

const HOME_FALLBACK_LOCATION =
  "BSA Feldbergstraße, Feldbergstr. 65, 81825 München";

function isFestivalSummary(summary: string) {
  return /kinderfestival/i.test(summary || "");
}

/**
 * For festival rows the BFV-ICS SUMMARY looks like:
 *   "FC Stern München U9-I - Kinderfestival-FC Stern München U9-I, ..."
 *   "ESV München U9-I - Kinderfestival-FC Stern München U9-I, ..."
 *
 * We treat the *host/ausrichter* as the part BEFORE "Kinderfestival".
 */
function festivalHostFromSummary(summary: string) {
  const s0 = (summary || "").replace(/\s+/g, " ").trim();
  const idx = s0.toLowerCase().indexOf("kinderfestival");
  if (idx < 0) return "";
  let host = s0.slice(0, idx);
  // remove trailing separators like "-" / "–" / "—" and surrounding spaces
  host = host.replace(/[\s\-–—:]+$/g, "").trim();
  return host;
}

function isHomeFestival(summary: string) {
  // BFV teammatches ICS often has empty LOCATION for Kinderfestival.
  // Pattern is typically: "<HOST> - Kinderfestival - <TEAM>\, ..."
  // We treat it as a home festival only if HOST and TEAM belong to the same club.
  if (!isFestivalSummary(summary)) return false;

  const parts = summary.split(/\s*-\s*Kinderfestival\s*-\s*/i);
  if (parts.length < 2) return false;

  const hostRaw = (parts[0] || "").trim();
  const teamRaw = (parts[1] || "").trim();

  // Cut off trailing meta (escaped commas, commas, newlines)
  const cut = (s: string) =>
    s
      .split(/\\,|,|\\n|\\r|\n|\r/)[0]
      .replace(/\\+/g, "")
      .trim();

  const normalize = (s: string) =>
    cut(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();

  // Reduce to club name by stripping trailing age/team identifiers (e.g. "U9-II", "U8 I", etc.)
  const clubBase = (s: string) => {
    const n = normalize(s);
    // remove "u9", "u10" and anything after it
    const base = n.replace(/\bu\d{1,2}\b.*$/i, "").trim();
    return base || n;
  };

  const hostClub = clubBase(hostRaw);
  const teamClub = clubBase(teamRaw);

  return hostClub.length > 0 && hostClub === teamClub;
}

function fillMissingLocation(ev: IcsEvent, inferredHomeLocation: string) {
  const loc = (ev.location || "").trim();
  if (loc) return ev;

  if (isFestivalSummary(ev.summary)) {
    if (isHomeFestival(ev.summary)) {
      return {
        ...ev,
        location: inferredHomeLocation || HOME_FALLBACK_LOCATION,
      };
    }
    return { ...ev, location: "Auswärts" };
  }

  return { ...ev, location: "Ort nicht im BFV-ICS" };
}


function buildIcs(events: IcsEvent[]) {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//FCSternPitchPlanner//BFV ICS Proxy//DE");
  lines.push("CALSCALE:GREGORIAN");

  const now = new Date();
  const dtstamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    "T" +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0") +
    String(now.getUTCSeconds()).padStart(2, "0") +
    "Z";

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${icsEscape(e.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${e.start}`);
    lines.push(`DTEND:${e.end}`);
    lines.push(`SUMMARY:${icsEscape(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.status) lines.push(`STATUS:${icsEscape(e.status)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  const debug = searchParams.get("debug") === "1";

  if (!raw) {
    return NextResponse.json({ error: "Missing url query param" }, { status: 400 });
  }

  const sourceUrl = normalizeSourceUrl(decodeURIComponent(raw));

  let u: URL;
  try {
    u = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (u.protocol !== "https:") {
    return NextResponse.json({ error: "Only https/webcal supported" }, { status: 400 });
  }
  if (!isAllowedHost(u.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const res = await fetch(u.toString(), {
    cache: "no-store",
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      accept: "text/calendar,text/plain,text/html,*/*",
      "accept-language": "de-DE,de;q=0.9,en;q=0.8",
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return NextResponse.json(
      { error: "BFV fetch failed", status: res.status, text: text.slice(0, 1200) },
      { status: 502 }
    );
  }

  if (!looksLikeIcs(text)) {
    if (debug) {
      return NextResponse.json({
        sourceUrl: u.toString(),
        fetchedLen: text.length,
        head: text.slice(0, 400),
        note:
          "Response did not look like ICS. Store a service.bfv.de icsexport URL like https://service.bfv.de/rest/icsexport/teammatches/teamPermanentId/....",
      });
    }
    return NextResponse.json(
      { error: "Not an ICS response from BFV", head: text.slice(0, 300) },
      { status: 400 }
    );
  }

  const normalized = parseIcsEvents(text).map((e) => ({
    ...e,
    summary: normalizeSummary(e.summary),
    location: normalizeLocation(e.location),
  }));

  // Best-effort "home" location inference from any event that contains a real address.
  const inferredHomeLocation =
    normalized.find(
      (e) =>
        (e.location || "").trim() &&
        /(feldberg|straße|str\.|münchen)/i.test(e.location)
    )?.location.trim() || "";

  const parsed = normalized.map((e) => fillMissingLocation(e, inferredHomeLocation));

  parsed.sort((a, b) => (a.start > b.start ? 1 : a.start < b.start ? -1 : 0));

  if (debug) {
    return NextResponse.json({
      sourceUrl: u.toString(),
      fetchedLen: text.length,
      unfoldedLen: normalizeAndUnfoldIcs(text).length,
      hasDtstart: /\nDTSTART/i.test(normalizeAndUnfoldIcs(text)),
      hasDtend: /\nDTEND/i.test(normalizeAndUnfoldIcs(text)),
      events: parsed.length,
      firstFive: parsed.slice(0, 5).map((e) => ({
        start: e.start,
        summary: e.summary,
        location: e.location,
        status: e.status,
      })),
    });
  }

  const ics = buildIcs(parsed);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="bfv.ics"',
    },
  });
}
