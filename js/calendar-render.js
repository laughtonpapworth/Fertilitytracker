// Full fixed calendar-render.js

let viewMonth = 0;
let viewYear = 0;
let allEntries = [];
let allCycles = [];
let currentCycleIndex = 0;
let cycleViewEnabled = false;
let cycleBoundaries = [];

// Utility: left-pad numbers
function pad(num) {
  return String(num).padStart(2, '0');
}

// Helper: YYYY-MM-DD local ISO
function formatISO(input) {
  const d = new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Normalize phase string to detect Day 1 Period
function isDay1Phase(phase) {
  return (phase || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'day1period';
}

function normalizeStartDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);  // Start of day
  return d;
}

function normalizeEndDate(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);  // End of day
  return d;
}

/* --- Detection helpers --- */
function isSurgeEntry(e) {
  const val = (e.opk || '').toString().trim().toLowerCase();
  const num = parseFloat(val);
  const result = (e.opkResult || '').toLowerCase();
  return (
    (!isNaN(num) && num >= 1.0) ||
    val === 'surge' || val === 'solid' || val === 'solid face' ||
    result === 'surge' || result === 'solid' || result === 'solid face'
  );
}

function isFertileEntry(e) {
  const val = (e.opk || '').toString().trim().toLowerCase();
  const num = parseFloat(val);
  const result = (e.opkResult || '').toLowerCase();
  return (
    (!isNaN(num) && num >= 0.1 && num < 1.0) ||
    val === 'flashing' || result === 'flashing'
  );
}

/**
 * Compute average cycle length, fertile offset, and ovulation offset
 * across all completed cycles.
 */
function computeAverages(entries) {
  const day1Entries = entries
    .filter(e => isDay1Phase(e.phase))
    .map(e => ({ iso: formatISO(e.entryDate), date: new Date(e.entryDate) }))
    .sort((a, b) => a.date - b.date);

  if (day1Entries.length < 2) return null;

  const cycleLengths = [];
  const fertileOffsets = [];
  const ovOffsets = [];

  for (let i = 0; i < day1Entries.length - 1; i++) {
    const start = day1Entries[i];
    const end = day1Entries[i + 1];
    cycleLengths.push(Math.round((end.date - start.date) / 86400000));

    const cycleEntries = entries.filter(e => {
      const iso = formatISO(e.entryDate);
      return iso >= start.iso && iso < end.iso;
    });

    // first confirmed fertile
    const fertDates = cycleEntries
      .filter(isFertileEntry)
      .map(e => new Date(e.entryDate))
      .sort((a, b) => a - b);
    if (fertDates.length) {
      const periodEnd = new Date(start.date);
      periodEnd.setDate(periodEnd.getDate() + 4);
      fertileOffsets.push(
        Math.round((fertDates[0] - periodEnd) / 86400000)
      );
    }

    // confirmed ovulation = last surge + 1
    const surgeDates = cycleEntries
      .filter(isSurgeEntry)
      .map(e => new Date(e.entryDate))
      .sort((a, b) => a - b);
    if (surgeDates.length) {
      const ov = new Date(surgeDates.pop());
      ov.setDate(ov.getDate() + 1);
      ovOffsets.push(
        Math.round((ov - start.date) / 86400000)
      );
    }
  }

  const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const avgCycleLength   = cycleLengths.length   ? avg(cycleLengths)   : null;
  const avgFertileOffset = fertileOffsets.length ? avg(fertileOffsets) : null;
  const avgOvOffset      = ovOffsets.length      ? avg(ovOffsets)      : null;
  const lastDay1         = day1Entries.pop().date;

  return { avgCycleLength, avgFertileOffset, avgOvOffset, lastDay1 };
}

function initializeCycleView(entries) {
  allEntries = entries;

  const day1Dates = entries
    .filter(e => e.entryDate && isDay1Phase(e.phase))
    .map(e => new Date(e.entryDate))
    .sort((a, b) => a - b);

  let boundaries = [];

  // Compute averages once here
  const averages = computeAverages(entries);

  for (let i = 0; i < day1Dates.length; i++) {
    const start = day1Dates[i];
    let end;
    if (i + 1 < day1Dates.length) {
      end = new Date(day1Dates[i + 1]);
      end.setDate(end.getDate() - 1);
    } else {
      if (averages && averages.avgCycleLength) {
        end = new Date(start);
        end.setDate(end.getDate() + averages.avgCycleLength - 1);
      } else {
        end = new Date();
      }
    }
    if (end < start) end = new Date(start);
    boundaries.push({ start, end });
  }

  cycleBoundaries = boundaries;
  currentCycleIndex = cycleBoundaries.length - 1;
}

function renderCycleCalendar(entries, startDate, endDate) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  grid.innerHTML = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const hdr = document.createElement('div');
    hdr.className = 'weekday';
    hdr.textContent = d;
    grid.appendChild(hdr);
  });

  const start = normalizeStartDate(startDate);
  const end   = normalizeEndDate(endDate || Date.now());
  const firstDow = start.getDay();
  for (let i = 0; i < firstDow; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-box empty';
    grid.appendChild(blank);
  }

  let day = new Date(start);
  while (day <= end) {
    const iso = formatISO(day);
    const cell = document.createElement('div');
    cell.className = 'day-box';
    cell.dataset.date = iso;
    cell.innerHTML = `<div class="date-label">${day.getDate()}</div>`;
    grid.appendChild(cell);
    day.setDate(day.getDate() + 1);
  }

  applyLoggedPeriod(allEntries, start, end);
  applyLoggedFertile(entries, start, end);
  applyLoggedSurge(entries, start, end);
  applyLoggedOvulation(entries, start, end);
  applyLoggedSymptoms(entries, start, end);
  applyLoggedLuteal(entries, start, end);

  const preds = computeAverages(allEntries);
  if (preds) applyPredictedCycles(preds, 3, start, end);
}

function renderUnifiedCalendar(entries, month, year) {
  allEntries = entries;
  viewMonth  = month;
  viewYear   = year;

  const label = document.getElementById('monthLabel');
  if (label) {
    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    const shortYear = String(year).slice(-2);
    label.textContent = `${monthNames[month]}-${shortYear}`;
  }

  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const hdr = document.createElement('div');
    hdr.className = 'weekday';
    hdr.textContent = d;
    grid.appendChild(hdr);
  });
  const firstDow = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstDow; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-box empty';
    grid.appendChild(blank);
  }
  const daysCount = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysCount; d++) {
    const cell = document.createElement('div');
    cell.className = 'day-box';
    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
    cell.dataset.date = iso;
    cell.innerHTML = `<div class="date-label">${d}</div>`;
    grid.appendChild(cell);
  }

  const start = new Date(year, month, 1);
  const end   = new Date(year, month, daysCount);
  applyLoggedPeriod(entries, start, end);
  applyLoggedFertile(entries, start, end);
  applyLoggedSurge(entries, start, end);
  applyLoggedOvulation(entries, start, end);
  applyLoggedSymptoms(entries, start, end);
  applyLoggedLuteal(entries, start, end);

  const preds = computeAverages(allEntries);
  if (preds) applyPredictedCycles(preds, 3, start, end);
}

function changeMonth(offset) {
  viewMonth += offset;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderUnifiedCalendar(allEntries, viewMonth, viewYear);
}

/* — Logged highlight functions — */

function applyLoggedPeriod(entries, startDate, endDate) {
  const day1Dates = entries
    .filter(e => isDay1Phase(e.phase))
    .map(e => formatISO(e.entryDate));
  day1Dates.forEach(isoStart => {
    const [y, m, d] = isoStart.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    for (let i = 0; i < 5; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      if (dt >= startDate && dt <= endDate) {
        const box = document.querySelector(`.day-box[data-date="${formatISO(dt)}"]`);
        if (box) box.classList.add(i === 0 ? 'deep-red' : 'red');
      }
    }
  });
}

function applyLoggedFertile(entries, startDate, endDate) {
  document.querySelectorAll('.day-box.fertile').forEach(b => b.classList.remove('fertile'));
  entries.forEach(e => {
    if (!isFertileEntry(e)) return;
    const iso = formatISO(e.entryDate);
    const dt = new Date(iso);
    if (dt >= startDate && dt <= endDate) {
      const box = document.querySelector(`.day-box[data-date="${iso}"]`);
      if (box && !box.classList.contains('deep-red') && !box.classList.contains('red')) {
        box.classList.add('fertile');
      }
    }
  });
}

function applyLoggedSurge(entries, startDate, endDate) {
  document.querySelectorAll('.day-box.surge').forEach(b => b.classList.remove('surge'));
  entries.forEach(e => {
    if (!isSurgeEntry(e)) return;
    const iso = formatISO(e.entryDate);
    const dt = new Date(iso);
    if (dt >= startDate && dt <= endDate) {
      const box = document.querySelector(`.day-box[data-date="${iso}"]`);
      if (box && !box.classList.contains('deep-red') && !box.classList.contains('red')) {
        box.classList.add('surge');
      }
    }
  });
}

function applyLoggedOvulation(entries, startDate, endDate) {
  document.querySelectorAll('.day-box.ovulation').forEach(b => b.classList.remove('ovulation'));
  const day1Isos = entries
    .filter(e => isDay1Phase(e.phase))
    .map(e => formatISO(e.entryDate))
    .sort();
  day1Isos.forEach((startIso, idx) => {
    const endIso = day1Isos[idx + 1] || null;
    const surges = entries
      .filter(isSurgeEntry)
      .map(e => formatISO(e.entryDate))
      .filter(iso => iso > startIso && (!endIso || iso < endIso))
      .sort();
    if (!surges.length) return;
    const last = surges.pop();
    const dt = new Date(last);
    dt.setDate(dt.getDate() + 1);
    if (dt >= startDate && dt <= endDate) {
      const isoOv = formatISO(dt);
      const box = document.querySelector(`.day-box[data-date="${isoOv}"]`);
      if (box) {
        box.classList.remove('fertile');
        box.classList.add('ovulation');
      }
    }
  });
}

function applyLoggedSymptoms(entries, startDate, endDate) {
  document.querySelectorAll('.day-box .symptom-icon').forEach(el => el.remove());
  const periodSet = new Set();
  entries
    .filter(e => (e.phase || '').toLowerCase() === 'day1-period' || (e.phase || '').toLowerCase() === 'period')
    .forEach(e => {
      const dt = new Date(e.entryDate);
      const isDay1 = isDay1Phase(e.phase);
      const days = isDay1 ? 5 : 1;
      for (let i = 0; i < days; i++) {
        const d2 = new Date(dt);
        d2.setDate(dt.getDate() + i);
        periodSet.add(formatISO(d2));
      }
    });
  const iconsByDate = {};
  entries.forEach(e => {
    const iso = formatISO(e.entryDate);
    if (!iconsByDate[iso]) iconsByDate[iso] = new Set();
    if (e.spotting && e.spotting !== 'none') iconsByDate[iso].add('🚩');
    if (e.cramps && e.cramps !== 'none') iconsByDate[iso].add('🤕');
    if (e.breastChanges && e.breastChanges !== 'none') iconsByDate[iso].add('🤱');
    if (e.digestive && e.digestive !== 'none') iconsByDate[iso].add('🤢');
    if (e.sex && e.sex.toLowerCase() === 'yes') iconsByDate[iso].add('❤️');
  });
  Object.entries(iconsByDate).forEach(([iso, set]) => {
    const dt = new Date(iso);
    if (dt < startDate || dt > endDate) return;
    const box = document.querySelector(`.day-box[data-date="${iso}"]`);
    set.forEach(emoji => {
      const span = document.createElement('span');
      span.className = 'symptom-icon';
      span.textContent = emoji;
      box.appendChild(span);
    });
  });
}

function applyLoggedLuteal(entries, startDate, endDate) {
  document.querySelectorAll('.day-box.luteal').forEach(b => b.classList.remove('luteal'));
  const ovIsos = entries
    .filter(isSurgeEntry)
    .map(e => {
      const d = new Date(e.entryDate);
      d.setDate(d.getDate() + 1);
      return formatISO(d);
    })
    .sort();
  const day1Isos = entries
    .filter(e => isDay1Phase(e.phase))
    .map(e => formatISO(e.entryDate))
    .sort();
  ovIsos.forEach(ovIso => {
    const ovDate = new Date(ovIso);
    const nextDay1Iso = day1Isos.find(d1 => d1 > ovIso);
    const endDateCalc = nextDay1Iso ? new Date(nextDay1Iso) : endDate;
    let dt = new Date(ovDate);
    while (dt <= endDateCalc) {
      if (dt >= startDate && dt <= endDate) {
        const iso = formatISO(dt);
        const cell = document.querySelector(`.day-box[data-date="${iso}"]`);
        if (cell && !cell.classList.contains('deep-red') && !cell.classList.contains('ovulation')) {
          cell.classList.add('luteal');
        }
      }
      dt.setDate(dt.getDate() + 1);
    }
  });
}

/* — Predictions (period, fertile, ovulation) — */
function applyPredictedCycles({ avgCycleLength, avgFertileOffset, avgOvOffset, lastDay1 }, count, startDate, endDate) {
  for (let cycle = 0; cycle <= count; cycle++) {
    const start = new Date(lastDay1);
    start.setDate(start.getDate() + avgCycleLength * cycle);
    if (start > endDate) break;
    for (let i = 0; i < 5; i++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + i);
      if (dt >= startDate && dt <= endDate) markPrediction(dt, '🩸');
    }
    const pe = new Date(start);
    pe.setDate(pe.getDate() + 4);
    const fs = new Date(pe);
    fs.setDate(fs.getDate() + avgFertileOffset);
    const fe = new Date(start);
    fe.setDate(fe.getDate() + avgOvOffset);
    for (let dt = new Date(fs); dt <= fe; dt.setDate(dt.getDate() + 1)) {
      if (dt >= startDate && dt <= endDate) markPrediction(dt, '🔵');
    }
    const ov = new Date(start);
    ov.setDate(ov.getDate() + avgOvOffset);
    if (ov >= startDate
