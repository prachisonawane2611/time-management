// ── State ──────────────────────────────────────────────────────────
const cfg = {
  work: 25, short: 5, long: 15, interval: 4,
  alarm: true, notif: true, askTask: true, autoBreak: false, autoWork: false
};
const state = {
  mode: 'work',
  running: false,
  remaining: cfg.work * 60,
  total: cfg.work * 60,
  session: 1,
  pomodorosDone: 0,
  focusedMinutes: 0,
  streak: 0,
  tasks: [],
  activeTask: null,
  interval: null
};

// Persist stats across reload (localStorage)
function loadStats() {
  const today = new Date().toDateString();
  const saved = JSON.parse(localStorage.getItem('pomo_stats') || '{}');
  if (saved.date === today) {
    state.pomodorosDone = saved.pomodoros || 0;
    state.focusedMinutes = saved.focused || 0;
    state.streak = saved.streak || 0;
  }
  state.tasks = JSON.parse(localStorage.getItem('pomo_tasks') || '[]');
}
function saveStats() {
  localStorage.setItem('pomo_stats', JSON.stringify({
    date: new Date().toDateString(),
    pomodoros: state.pomodorosDone,
    focused: state.focusedMinutes,
    streak: state.streak
  }));
  localStorage.setItem('pomo_tasks', JSON.stringify(state.tasks));
}
function loadCfg() {
  const saved = JSON.parse(localStorage.getItem('pomo_cfg') || '{}');
  Object.assign(cfg, saved);
}
function saveCfg() {
  localStorage.setItem('pomo_cfg', JSON.stringify(cfg));
}

// ── DOM refs ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const display = $('timerDisplay'), label = $('timerLabel'), tag = $('sessionTag');
const ring = $('ringProgress'), dots = $('sessionDots');
const playBtn = $('playBtn'), resetBtn = $('resetBtn'), skipBtn = $('skipBtn');
const taskList = $('taskList'), taskInput = $('taskInput'), emptyEl = $('emptyTasks');

// ── Theme ──────────────────────────────────────────────────────────
let dark = localStorage.getItem('pomo_theme') === 'dark';
function applyTheme() {
  document.body.dataset.theme = dark ? 'dark' : 'light';
  $('themeBtn').textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('pomo_theme', dark ? 'dark' : 'light');
}
$('themeBtn').onclick = () => { dark = !dark; applyTheme(); };

// ── Timer core ─────────────────────────────────────────────────────
const CIRC = 2 * Math.PI * 95;

function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}
function setMode(mode) {
  state.mode = mode;
  const dur = mode === 'work' ? cfg.work : mode === 'short' ? cfg.short : cfg.long;
  state.remaining = state.total = dur * 60;
  state.running = false;
  clearInterval(state.interval);
  playBtn.textContent = '▶';
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  const labels = { work: ['Focus time','Work Session','tag-work'], short: ['Short break','Short Break','tag-break'], long: ['Long break','Long Break','tag-long'] };
  const [lbl, tagTxt, tagCls] = labels[mode];
  label.textContent = lbl;
  tag.textContent = tagTxt;
  tag.className = 'session-tag ' + tagCls;
  document.title = fmt(state.remaining) + ' — FocusTimer';
  renderRing();
}
function renderRing() {
  display.textContent = fmt(state.remaining);
  document.title = fmt(state.remaining) + ' · FocusTimer';
  const pct = state.remaining / state.total;
  ring.style.strokeDashoffset = CIRC * (1 - pct);
  ring.style.stroke = state.mode === 'work' ? 'var(--accent)' : state.mode === 'short' ? 'var(--green)' : 'var(--blue)';
}
function renderDots() {
  dots.innerHTML = '';
  const total = cfg.interval;
  for (let i = 1; i <= total; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < state.session ? ' done' : i === state.session ? ' current' : '');
    dots.appendChild(d);
  }
}
function renderStats() {
  $('statPomodoros').textContent = state.pomodorosDone;
  $('statFocused').textContent = state.focusedMinutes + 'm';
  $('statStreak').textContent = state.streak;
}
function tick() {
  if (state.remaining > 0) {
    state.remaining--;
    if (state.mode === 'work') state.focusedMinutes = Math.floor((state.total - state.remaining) / 60);
    renderRing();
    renderStats();
    saveStats();
  } else {
    onSessionEnd();
  }
}
function onSessionEnd() {
  clearInterval(state.interval);
  state.running = false;
  playBtn.textContent = '▶';
  if (cfg.alarm) playAlarm();
  if (cfg.notif) sendNotif();
  if (state.mode === 'work') {
    state.pomodorosDone++;
    state.streak++;
    state.focusedMinutes += Math.floor(state.total / 60);
    saveStats();
    renderStats();
    if (cfg.askTask && state.tasks.length > 0) {
      showTaskModal();
    } else {
      scheduleBreak();
    }
  } else {
    if (cfg.autoWork) { setTimeout(() => { setMode('work'); startTimer(); }, 1500); }
    else { setMode('work'); showToast('Break over! Ready to focus? ▶'); }
  }
}
function scheduleBreak() {
  const nextMode = state.session >= cfg.interval ? 'long' : 'short';
  if (state.session >= cfg.interval) state.session = 1; else state.session++;
  renderDots();
  if (cfg.autoBreak) { setTimeout(() => { setMode(nextMode); startTimer(); }, 1500); }
  else { setMode(nextMode); showToast(nextMode === 'long' ? 'Long break time! 🌿' : 'Short break time! ☕'); }
}
function startTimer() {
  if (state.running) return;
  state.running = true;
  playBtn.textContent = '⏸';
  if ('Notification' in window && cfg.notif && Notification.permission === 'default') Notification.requestPermission();
  state.interval = setInterval(tick, 1000);
}
function pauseTimer() {
  clearInterval(state.interval);
  state.running = false;
  playBtn.textContent = '▶';
}

playBtn.onclick = () => state.running ? pauseTimer() : startTimer();
resetBtn.onclick = () => { pauseTimer(); setMode(state.mode); };
skipBtn.onclick = () => { pauseTimer(); onSessionEnd(); };

document.querySelectorAll('.mode-tab').forEach(t => {
  t.onclick = () => { pauseTimer(); setMode(t.dataset.mode); };
});

// ── Alarm ──────────────────────────────────────────────────────────
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.3, ctx.currentTime + i*0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.18 + 0.3);
      o.start(ctx.currentTime + i*0.18);
      o.stop(ctx.currentTime + i*0.18 + 0.35);
    });
  } catch(e) {}
}

// ── Notifications ─────────────────────────────────────────────────
function sendNotif() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const msg = state.mode === 'work' ? 'Pomodoro done! Time for a break 🎉' : 'Break over! Back to work 💪';
  new Notification('FocusTimer', { body: msg, icon: '' });
}

// ── Task Modal ─────────────────────────────────────────────────────
function showTaskModal() {
  const activeTasks = state.tasks.filter(t => !t.done);
  const name = activeTasks.length > 0 ? activeTasks[0].name : null;
  $('modalBody').innerHTML = name
    ? `Did you complete <span class="modal-task-name">"${name}"</span>?`
    : 'Did you complete what you were working on?';
  $('taskModal').classList.add('open');
}

// ✅ UPDATED PART
$('modalYes').onclick = () => {
  const activeTasks = state.tasks.filter(t => !t.done);
  if (activeTasks.length > 0) markTaskDone(activeTasks[0].id, true);
  $('taskModal').classList.remove('open');
  showToast('Great job! Task complete ✓');
  scheduleBreak();
};

$('modalNo').onclick = () => {
  $('taskModal').classList.remove('open');

  const quotes = [
    "Stay focused. You're closer than you think.",
    "Don't stop now. Great things take time.",
    "Push a little more. Success is near.",
    "Small steps every day lead to big results.",
    "You didn’t come this far to only come this far.",
    "Focus now, enjoy later.",
    "Discipline beats motivation. Keep going.",
    "One more push. You’ve got this."
  ];

  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  showToast(randomQuote);

  setTimeout(() => {
    setMode('work');
    state.remaining = 5 * 60;
    state.total = 5 * 60;
    renderRing();
    startTimer();
  }, 2000);
};

// ── Tasks ──────────────────────────────────────────────────────────
function addTask(name) {
  if (!name.trim()) return;
  state.tasks.push({ id: Date.now(), name: name.trim(), done: false, pomodoros: 0 });
  saveStats(); renderTasks();
}
function markTaskDone(id, done) {
  const t = state.tasks.find(t => t.id === id);
  if (t) { t.done = done; saveStats(); renderTasks(); }
}
function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveStats(); renderTasks();
}
function renderTasks() {
  taskList.innerHTML = '';
  if (state.tasks.length === 0) { taskList.appendChild(emptyEl); emptyEl.style.display=''; return; }
  state.tasks.forEach(t => {
    const el = document.createElement('div');
    el.className = 'task-item' + (t.done ? ' done' : '');
    el.innerHTML = `
      <div class="task-check ${t.done?'checked':''}" data-id="${t.id}">${t.done?'✓':''}</div>
      <span class="task-name">${escHtml(t.name)}</span>
      <span class="task-pomodoros">🍅 ${t.pomodoros}</span>
      <button class="task-del" data-id="${t.id}">✕</button>`;
    el.querySelector('.task-check').onclick = () => markTaskDone(t.id, !t.done);
    el.querySelector('.task-del').onclick = () => deleteTask(t.id);
    taskList.appendChild(el);
  });
}
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

$('addTaskBtn').onclick = () => { addTask(taskInput.value); taskInput.value = ''; };
taskInput.onkeydown = e => { if (e.key === 'Enter') { addTask(taskInput.value); taskInput.value = ''; } };

// ── Settings ───────────────────────────────────────────────────────
$('settingsBtn').onclick = () => {
  $('setWork').value = cfg.work;
  $('setShort').value = cfg.short;
  $('setLong').value = cfg.long;
  $('setInterval').value = cfg.interval;
  ['alarm','notif','askTask','autoBreak','autoWork'].forEach(k => {
    const el = document.querySelector(`[data-key="${k}"]`);
    if (el) el.classList.toggle('on', !!cfg[k]);
  });
  $('settingsPanel').classList.add('open');
};
$('closeSettings').onclick = () => $('settingsPanel').classList.remove('open');
$('settingsPanel').onclick = e => { if (e.target === $('settingsPanel')) $('settingsPanel').classList.remove('open'); };
document.querySelectorAll('.toggle').forEach(t => {
  t.onclick = () => t.classList.toggle('on');
});
$('saveSettings').onclick = () => {
  cfg.work = Math.max(1, Math.min(90, parseInt($('setWork').value)||25));
  cfg.short = Math.max(1, Math.min(30, parseInt($('setShort').value)||5));
  cfg.long = Math.max(1, Math.min(60, parseInt($('setLong').value)||15));
  cfg.interval = Math.max(2, Math.min(8, parseInt($('setInterval').value)||4));
  cfg.alarm = $('togAlarm').classList.contains('on');
  cfg.notif = $('togNotif').classList.contains('on');
  cfg.askTask = $('togAsk').classList.contains('on');
  cfg.autoBreak = $('togAutoBreak').classList.contains('on');
  cfg.autoWork = $('togAutoWork').classList.contains('on');
  saveCfg();
  pauseTimer();
  setMode(state.mode);
  renderDots();
  $('settingsPanel').classList.remove('open');
  showToast('Settings saved!');
};

// ── Toast ──────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── GRADIENT BACKGROUND SUPPORT ────────────────────────────────────
const gradients = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #ff9a9e, #fad0c4)",
  "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  "linear-gradient(135deg, #f6d365, #fda085)",
  "linear-gradient(135deg, #84fab0, #8fd3f4)",
  "linear-gradient(135deg, #cfd9df, #e2ebf0)",

  // ✅ Navy blue → Light blue gradient
  "linear-gradient(135deg, #001f3f, #87cefa)"
];

let currentGradient = localStorage.getItem('pomo_gradient') || gradients[0];

function applyGradient() {
  document.body.style.background = currentGradient;
  localStorage.setItem('pomo_gradient', currentGradient);
}

// change gradient on double click anywhere
document.body.ondblclick = () => {
  const index = Math.floor(Math.random() * gradients.length);
  currentGradient = gradients[index];
  applyGradient();
};

// apply on load
applyGradient();


// ── Init ───────────────────────────────────────────────────────────
loadCfg(); loadStats(); applyTheme();
setMode('work'); renderDots(); renderStats(); renderTasks();