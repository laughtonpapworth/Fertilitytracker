// calendar.js

let viewMonth = new Date().getMonth();
let viewYear = new Date().getFullYear();
let allEntries = [];
let onMonthChangeCallback = null;

function setMonthChangeHandler(callback) {
  onMonthChangeCallback = callback;
}

function changeMonth(offset) {
  const newDate = new Date(viewYear, viewMonth + offset);
  viewMonth = newDate.getMonth();
  viewYear = newDate.getFullYear();
  if (onMonthChangeCallback) onMonthChangeCallback(viewMonth, viewYear);
}

function groupEntriesByDate(entries) {
  return entries.reduce((acc, e) => {
    const dateKey = new Date(e.entryDate).toLocaleDateString('en-CA');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(e);
    return acc;
  }, {});
}

function markPhases(entries) {
  const map = {};
  const sorted = [...entries].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  const dateMap = {};

  for (const e of sorted) {
    const key = new Date(e.entryDate).toLocaleDateString('en-CA');
    if (!dateMap[key]) dateMap[key] = [];
    dateMap[key].push(e);
  }

  let lutealStartDate = null;
  const keys = Object.keys(dateMap).sort((a, b) => new Date(a) - new Date(b));

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const entries = dateMap[key];
    const date = new Date(key);

    const hasDay1 = entries.some(e => (e.phase || '').toLowerCase() === 'day1-period');
    const hasSurge = entries.some(e => (e.opk || '').toLowerCase() === 'surge');
    const hasSolid = entries.some(e => (e.opk || '').toLowerCase() === 'solid face');
    const hasFlashing = entries.some(e => (e.opk || '').toLowerCase() === 'flashing face');

    if (hasDay1) {
      map[key] = 'deep-red';
      const baseDate = new Date(date);
      for (let j = 1; j <= 4; j++) {
        const nextDate = new Date(baseDate);
        nextDate.setDate(baseDate.getDate() + j);
        const nextKey = nextDate.toLocaleDateString('en-CA');
        map[nextKey] = 'red';
      }
      lutealStartDate = null;
    } else if (hasSurge) {
      map[key] = 'bold-pink';
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);
      const nextKey = nextDate.toLocaleDateString('en-CA');
      map[nextKey] = 'bold-pink';

      lutealStartDate = new Date(date);
      lutealStartDate.setDate(lutealStartDate.getDate() + 2);
    } else if (hasSolid) {
      map[key] = 'light-pink';
    } else if (hasFlashing) {
      map[key] = 'blue';
    } else if (lutealStartDate && date >= lutealStartDate) {
      map[key] = 'peach';
    }
  }
  return map;
}

function renderCalendar(entries, month, year) {
  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const weekdayContainer = document.getElementById("calendarWeekdays");
  if (weekdayContainer) {
    weekdayContainer.innerHTML = weekdays.map(d => `<div class="weekday">${d}</div>`).join('');
  }

  const container = document.getElementById("calendarGrid");
  if (!container) return;
  container.innerHTML = "";

  const map = groupEntriesByDate(entries);
  const phaseMap = markPhases(entries);

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const offset = (start.getDay() + 6) % 7;

  for (let j = 0; j < offset; j++) {
    container.appendChild(document.createElement("div"));
  }

  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(year, month, d);
    const key = date.toLocaleDateString('en-CA');
    const dayEntries = map[key] || [];
    const box = document.createElement("div");
    box.className = "day-box";
    box.textContent = d;

    if (phaseMap[key]) {
      box.classList.add(phaseMap[key]);
    }

    const emojiStyle = 'font-size: 0.9em; display: block;';
    const iconFlags = {
      sex: false,
      breastChanges: false,
      digestive: false,
      bbt: false,
      cramps: false,
      spotting: false,
      mood: false
    };

    dayEntries.forEach(e => {
      if ((e.sex || '').toLowerCase() === 'yes') iconFlags.sex = true;
      if (e.breastChanges && e.breastChanges.toLowerCase() !== 'none') iconFlags.breastChanges = true;
      if (e.digestive && e.digestive.toLowerCase() !== 'none') iconFlags.digestive = true;
      if (e.bbt && !isNaN(parseFloat(e.bbt))) iconFlags.bbt = true;
      if (e.cramps && e.cramps.toLowerCase() !== 'none') iconFlags.cramps = true;
      if (e.spotting && e.spotting.toLowerCase() !== 'none') iconFlags.spotting = true;
      if (e.mood) iconFlags.mood = true;
    });

    if (iconFlags.sex) box.appendChild(Object.assign(document.createElement('span'), { textContent: '💖', style: emojiStyle }));
    if (iconFlags.cramps) box.appendChild(Object.assign(document.createElement('span'), { textContent: '😖', style: emojiStyle }));
    if (iconFlags.spotting) box.appendChild(Object.assign(document.createElement('span'), { textContent: '🔻', style: emojiStyle }));
    if (iconFlags.mood) box.appendChild(Object.assign(document.createElement('span'), { textContent: '🧠', style: emojiStyle }));
    if (iconFlags.breastChanges) box.appendChild(Object.assign(document.createElement('span'), { textContent: '🫶', style: emojiStyle }));
    if (iconFlags.digestive) box.appendChild(Object.assign(document.createElement('span'), { textContent: '🫃', style: emojiStyle }));
    if (iconFlags.bbt) box.appendChild(Object.assign(document.createElement('span'), { textContent: '🌡️', style: emojiStyle }));

    container.appendChild(box);
  }

  const label = document.getElementById("monthLabel");
  if (label) {
    label.textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  }
}

// Export functions to global scope
window.renderCalendar = renderCalendar;
window.markPhases = markPhases;
window.changeMonth = changeMonth;
window.setMonthChangeHandler = setMonthChangeHandler;
window.viewMonth = viewMonth;
window.viewYear = viewYear;
