// calendar-render.js — pure JS, no HTML.
// Exposes: window.initializeCycleView(options?)
// Options:
//   entries?: Array<entry>  // if provided, skip Firestore
//   container?: Element     // defaults to document
//   onComputed?: (cycles) => void  // callback with computed cycles
//
// Calendar marking contract:
//   We add classes to elements that match [data-date="YYYY-MM-DD"] in the container:
//     .period, .fertile, .surge, .ovulation, .luteal
//   If you also want small markers, add a child <span class="marker"> in your DOM/CSS.

(function () {
  "use strict";

  // ===== Date helpers (UTC-normalised) =====
  function toUTCmid(d) { return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
  function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function dayDiff(a, b) {
    if (!(a instanceof Date) || !(b instanceof Date)) return 0;
    const A = toUTCmid(a), B = toUTCmid(b);
    return Math.max(0, Math.floor((B - A) / 86400000));
  }
  function iso(d) { return (d instanceof Date && !isNaN(d)) ? d.toISOString().slice(0, 10) : "—"; }

  // ===== Robust input date parsing (supports Firestore timestamps/strings) =====
  function parseAnyDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "number") { const d = new Date(v); return isNaN(d) ? null : d; }
    if (typeof v === "object") {
      if (typeof v.toDate === "function") { try { const d = v.toDate(); return isNaN(d) ? null : d; } catch (_) {} }
      if (typeof v.seconds === "number") { const d = new Date(v.seconds * 1000); return isNaN(d) ? null : d; }
    }
    const d = new Date(String(v));
    return isNaN(d) ? null : d;
  }
  function getEntryDate(e) {
    const candidates = [e.timestamp, e.timeStamp, e.ts, e.recordedAt, e.date, e.Date, e.createdAt, e.created, e.created_on, e.id];
    for (const v of candidates) { const d = parseAnyDate(v); if (d) return d; }
    return null;
  }

  // ===== BBT parse (kept minimal; safe bounds) =====
  function parseBBT(v) {
    if (v == null) return null;
    let n = (typeof v === "number") ? v : parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
    if (!isFinite(n)) return null;
    if (n > 80) n = (n - 32) * 5 / 9; // F → C
    if (n < 35.0 || n > 38.5) return null;
    return n;
  }

  // ===== Day 1 detection =====
  function isDay1(e) {
    const ph = (e.phase || "").toLowerCase();
    return ph.includes("day1-period") || ph.includes("day1") || ph.includes("day 1") ||
           ph.includes("day-1") || ph.includes("period start") || e.day1 === true;
  }

  // ===== OPK / LH helpers (updated thresholds + aliases) =====
  function opkAsNumber(v) {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const s = String(v).trim().toLowerCase();
    if (s.includes("surge") || s.includes("solid")) return 1.0;   // legacy labels -> surge
    if (s.includes("flashing")) return 0.5;                       // legacy label -> fertile
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function opkClass(v) {
    if (v == null) return "none";
    const s = (typeof v === "string") ? v.toLowerCase() : "";
    const n = opkAsNumber(v);
    if (s.includes("surge") || s.includes("solid") || (n != null && n >= 1.0)) return "surge";     // >= 1.0
    if (s.includes("flashing") || (n != null && n >= 0.1 && n < 1.0)) return "fertile";            // 0.1–0.99
    return "none";
  }
  function getOPKValue(e) { return (e.opk ?? e.lh ?? e.opkValue ?? null); }

  // ===== Load + normalise entries (optionally from Firestore) =====
  async function loadEntriesFromFirestore() {
    if (!(window.firebase && firebase.firestore && firebase.auth)) return [];
    const u = firebase.auth().currentUser || await new Promise(res => {
      const off = firebase.auth().onAuthStateChanged(x => { off(); res(x); });
    });
    if (!u) return [];
    const db = firebase.firestore();

    function normalizeDoc(d) {
      const o = d.data(); o.id = d.id; o._src = d.ref.path;
      const dd = getEntryDate(o); o._date = dd; o._key = dd ? iso(dd) : null;
      o._bbt = parseBBT(o.bbt);
      return o;
    }

    const topP = db.collection("entries").get().then(s => s.docs.map(normalizeDoc)).catch(() => []);
    const userP = db.collection("users").doc(u.uid).collection("entries").get().then(s => s.docs.map(normalizeDoc)).catch(() => []);
    const [A, B] = await Promise.all([topP, userP]);

    // Merge by date-key; prefer Day1, prefer user-scope on ties
    const merged = {};
    for (const e of [...A, ...B]) {
      if (!e._date) continue;
      const k = e._key;
      if (!merged[k]) { merged[k] = e; continue; }
      const cur = merged[k];
      const curIsD1 = isDay1(cur), eIsD1 = isDay1(e);
      if (eIsD1 && !curIsD1) { merged[k] = e; continue; }
      if (!eIsD1 && curIsD1) { continue; }
      const curIsUser = String(cur._src || "").includes("/users/");
      const eIsUser = String(e._src || "").includes("/users/");
      if (!curIsUser && eIsUser) { merged[k] = e; continue; }
    }
    return Object.keys(merged).sort().map(k => merged[k]);
  }

  // ===== Cycle building (completed + live) =====
  function segmentCycles(entries) {
    const byDate = entries.filter(e => e._date instanceof Date && !isNaN(e._date)).sort((a, b) => a._date - b._date);
    const idxDay1 = []; for (let i = 0; i < byDate.length; i++) if (isDay1(byDate[i])) idxDay1.push(i);
    const cycles = [];

    // Completed cycles: Day1 -> next Day1
    for (let c = 0; c < idxDay1.length - 1; c++) {
      cycles.push(buildCycle(byDate.slice(idxDay1[c], idxDay1[c + 1]), true));
    }

    // Live cycle: last Day1 -> today (if any Day1 exists)
    if (idxDay1.length) {
      const seg = byDate.slice(idxDay1[idxDay1.length - 1]);
      if (seg.length) cycles.push(buildCycle(seg, false));
    }

    return cycles;
  }

  function buildCycle(seg, completed) {
    const startDate = toUTCmid(seg[0]._date);
    const nextStart = completed ? toUTCmid(seg[seg.length - 1]._date) : null; // for completed we’ll compute below
    const periodStart = startDate;
    const periodEnd = addDays(periodStart, 4);

    // Surge detection: first explicit surge else max numeric ≥ 1.0
    let surgeDate = null, maxNum = -Infinity, maxDate = null;
    for (const e of seg) {
      const v = getOPKValue(e);
      const d = toUTCmid(e._date);
      const cls = opkClass(v);
      if (cls === "surge") { surgeDate = d; break; }
      const n = opkAsNumber(v); if (n != null && n > maxNum) { maxNum = n; maxDate = d; }
    }
    if (!surgeDate && maxDate && maxNum >= 1.0) surgeDate = maxDate;

    const ovulationDate = surgeDate ? addDays(surgeDate, 1) : null;

    // Fertile window (use readings; backfill to 5d pre-O if none)
    let fertileStart = null, fertileEnd = null;
    if (ovulationDate) {
      const lastPreO = addDays(ovulationDate, -1);
      for (const e of seg) {
        const d = toUTCmid(e._date);
        if (d <= periodEnd) continue;
        if (d > lastPreO) break;
        if (opkClass(getOPKValue(e)) === "fertile") { if (!fertileStart) fertileStart = d; fertileEnd = d; }
      }
      if (!fertileStart) fertileStart = addDays(ovulationDate, -5);
      if (!fertileEnd) fertileEnd = lastPreO;
      if (fertileStart && fertileStart <= periodEnd) fertileStart = addDays(periodEnd, 1);
    }

    // Luteal length only if completed & we know next Day1
    let nextStartComputed = null;
    if (completed) {
      // In completed seg, last item is the next Day-1 (by how we sliced)
      nextStartComputed = toUTCmid(seg[seg.length - 1]._date);
    }
    const lutealLen = (completed && ovulationDate && nextStartComputed) ? dayDiff(ovulationDate, nextStartComputed) : null;

    // Minimal BBT metrics skipped here (not needed to mark the calendar)
    return {
      entries: seg,
      startDate,
      nextStart: completed ? nextStartComputed : null,
      completed,
      periodStart, periodEnd,
      surgeDate, ovulationDate,
      fertileStart, fertileEnd,
      lutealLen
    };
  }

  // ===== DOM marking =====
  function markRange(container, start, end, className) {
    if (!start || !end) return;
    let d = toUTCmid(start);
    const stop = addDays(toUTCmid(end), 1); // inclusive range
    while (d < stop) {
      const cell = container.querySelector(`[data-date="${iso(d)}"]`);
      if (cell) cell.classList.add(className);
      d = addDays(d, 1);
    }
  }
  function markTick(container, date, className) {
    if (!date) return;
    const cell = container.querySelector(`[data-date="${iso(date)}"]`);
    if (cell) cell.classList.add(className);
  }

  // ===== Public API =====
  async function initializeCycleView(options) {
    const opts = options || {};
    const container = opts.container || document;
    let entries = Array.isArray(opts.entries) ? opts.entries.slice() : null;

    // Clear any old markings
    ["period", "fertile", "surge", "ovulation", "luteal"].forEach(cls => {
      container.querySelectorAll("." + cls).forEach(el => el.classList.remove(cls));
    });

    if (!entries) {
      entries = await loadEntriesFromFirestore();
    }

    // Normalise & sort
    entries = entries.map(e => {
      const d = getEntryDate(e); return Object.assign({}, e, { _date: d, _key: d ? iso(d) : null, _bbt: parseBBT(e.bbt) });
    }).filter(e => e._date);

    const cycles = segmentCycles(entries);

    // Mark calendar (all cycles)
    for (const c of cycles) {
      // Period
      markRange(container, c.periodStart, c.periodEnd, "period");
      // Fertile
      if (c.fertileStart && c.fertileEnd) markRange(container, c.fertileStart, c.fertileEnd, "fertile");
      // Surge tick
      markTick(container, c.surgeDate, "surge");
      // Ovulation tick (surge + 1)
      markTick(container, c.ovulationDate, "ovulation");
      // Luteal (completed cycles only; from day after ovulation to day before next Day-1)
      if (c.completed && c.ovulationDate && c.nextStart) {
        const lutealStart = addDays(c.ovulationDate, 1);
        const lutealEnd = addDays(c.nextStart, -1);
        if (dayDiff(lutealStart, lutealEnd) >= 0) markRange(container, lutealStart, lutealEnd, "luteal");
      }
    }

    if (typeof opts.onComputed === "function") opts.onComputed(cycles);
    return cycles;
  }

  // Expose globally for summary.html
  window.initializeCycleView = initializeCycleView;
})();
