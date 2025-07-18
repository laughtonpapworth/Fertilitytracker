
// Firebase Setup with Real Config
const firebaseConfig = {
  apiKey: "AIzaSyByvnVx2aZEldUfqS2c6VNC6UJRIOPvGws",
  authDomain: "fertility-tracker-c35ff.firebaseapp.com",
  projectId: "fertility-tracker-c35ff",
  storageBucket: "fertility-tracker-c35ff.firebasestorage.app",
  messagingSenderId: "775022478214",
  appId: "1:775022478214:web:107ba4f9e0043bee75a207",
  measurementId: "G-E6DVNWZNKQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');

  function createInput(label, id, type = 'text', options = null) {
    const div = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.setAttribute('for', id);
    lbl.textContent = label;
    div.appendChild(lbl);
    let input;
    if (options) {
      input = document.createElement('select');
      input.id = id;
      options.forEach(opt => {
        const o = document.createElement('option');
        o.text = opt;
        input.add(o);
      });
    } else {
      input = document.createElement('input');
      input.type = type;
      input.id = id;
    }
    div.appendChild(input);
    return div;
  }

  function getLatestPeriodStart(entries) {
    const periodDays = entries.filter(e => e.phase === 'period' && e.flow && e.flow !== 'None');
    if (!periodDays.length) return null;
    return periodDays.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
  }

  function getOvulationDay(entries) {
    const ovulationTrigger = entries.find(e => e.phase === 'pre-ovulation' && e.opk === 'Solid face');
    if (!ovulationTrigger) return null;
    const date = new Date(ovulationTrigger.date);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }

  async function renderTracker() {
    app.innerHTML = '';
    const docRef = db.collection('entries');
    const snapshot = await docRef.get();
    const entries = [];
    snapshot.forEach(doc => entries.push(doc.data()));

    const today = new Date().toISOString().split('T')[0];
    const latestPeriod = getLatestPeriodStart(entries);
    const ovulationDay = getOvulationDay(entries);

    const cycleDay = latestPeriod ? Math.floor((new Date(today) - new Date(latestPeriod)) / (1000 * 60 * 60 * 24)) + 1 : '';
    const dpo = ovulationDay ? Math.max(0, Math.floor((new Date(today) - new Date(ovulationDay)) / (1000 * 60 * 60 * 24))) : '';

    const form = document.createElement('div');
    form.appendChild(createInput('Date', 'date', 'date')).querySelector('input').value = today;
    form.appendChild(createInput('Cycle Day', 'cycleDay', 'number')).querySelector('input').value = cycleDay;
    form.appendChild(createInput('DPO', 'dpo', 'number')).querySelector('input').value = dpo;
    form.appendChild(createInput('Phase', 'phase', null, ['period', 'pre-ovulation', 'ovulation', 'post-ovulation']));
    form.appendChild(createInput('BBT (°C)', 'bbt', 'number'));
    form.appendChild(createInput('Cervical Mucus', 'cm', null, ['Dry', 'Sticky', 'Creamy', 'Watery', 'Egg white']));
    form.appendChild(createInput('OPK Result', 'opk', null, ['Blank circle', 'Flashing face', 'Solid face']));
    form.appendChild(createInput('Sex', 'sex', null, ['Y', 'N']));
    form.appendChild(createInput('Mood', 'mood', null, ['Calm', 'Happy', 'Irritable', 'Low']));
    form.appendChild(createInput('Spotting', 'spotting', null, ['None', 'Pink', 'Brown', 'Red']));
    form.appendChild(createInput('Cramps', 'cramps', null, ['None', 'Mild', 'Moderate', 'Strong']));
    form.appendChild(createInput('Pregnancy Test Result', 'pregnancyResult', null, ['Negative', 'Faint Line', 'Positive']));

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Entry';
    saveBtn.onclick = async () => {
      const inputs = form.querySelectorAll('input, select');
      const entry = {};
      inputs.forEach(i => entry[i.id] = i.value);
      await db.collection('entries').doc(entry.date).set(entry);
      alert('Saved to cloud!');
    };
    form.appendChild(saveBtn);
    app.appendChild(form);
  }

  window.renderTracker = renderTracker;
  renderTracker();
});
