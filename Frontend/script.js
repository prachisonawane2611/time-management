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
  applyGradient();
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
    // Break ended — if game is open, show break-over screen, else handle normally
    if ($('gameOverlay').classList.contains('open')) {
      showBreakOverScreen();
    } else {
      if (cfg.autoWork) { setTimeout(() => { setMode('work'); startTimer(); }, 1500); }
      else { setMode('work'); showToast('Break over! Ready to focus? ▶'); }
    }
  }
}
function scheduleBreak() {
  const nextMode = state.session >= cfg.interval ? 'long' : 'short';
  if (state.session >= cfg.interval) state.session = 1; else state.session++;
  renderDots();
  if (cfg.autoBreak) { setTimeout(() => { setMode(nextMode); startTimer(); openGamePanel(nextMode); }, 1500); }
  else {
    setMode(nextMode);
    showToast(nextMode === 'long' ? '🌿 Long break! Want to play a game?' : '☕ Short break! Play a quick game?');
    // Auto-open game panel after break starts
    setTimeout(() => openGamePanel(nextMode), 800);
  }
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
    "You didn't come this far to only come this far.",
    "Focus now, enjoy later.",
    "Discipline beats motivation. Keep going.",
    "One more push. You've got this."
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

// ── Gradient System ────────────────────────────────────────────────
const TOTAL_GRADIENTS = 10;
let currentGradIdx = parseInt(localStorage.getItem('pomo_grad_idx') || '0');

function applyGradient() {
  // Remove all grad classes
  for (let i = 0; i < TOTAL_GRADIENTS; i++) document.body.classList.remove('grad-' + i);
  document.body.classList.add('grad-' + currentGradIdx);
  localStorage.setItem('pomo_grad_idx', currentGradIdx);
}

$('gradientBtn').onclick = () => {
  currentGradIdx = (currentGradIdx + 1) % TOTAL_GRADIENTS;
  applyGradient();
  showToast('🎨 New gradient!');
};

document.body.ondblclick = () => {
  currentGradIdx = Math.floor(Math.random() * TOTAL_GRADIENTS);
  applyGradient();
};

// ── 🎮 Game Panel ──────────────────────────────────────────────────
let gameBreakMode = 'short';
let gameTimerInterval = null;
let activeGame = null;
let gameBreakRemaining = 0;

function openGamePanel(mode) {
  gameBreakMode = mode;
  gameBreakRemaining = state.remaining;
  const overlay = $('gameOverlay');
  overlay.classList.add('open');
  const badge = $('gameBreakBadge');
  if (mode === 'long') {
    badge.textContent = '🌿 Long Break';
    badge.classList.add('long-break');
  } else {
    badge.textContent = '☕ Short Break';
    badge.classList.remove('long-break');
  }
  showGamePicker();
  startGameTimer();
}

function closeGamePanel() {
  $('gameOverlay').classList.remove('open');
  clearInterval(gameTimerInterval);
  stopActiveGame();
}

function startGameTimer() {
  clearInterval(gameTimerInterval);
  gameTimerInterval = setInterval(() => {
    gameBreakRemaining = state.remaining;
    const pill = $('gameTimerPill');
    pill.textContent = fmt(gameBreakRemaining);
    if (gameBreakRemaining <= 30) {
      pill.classList.add('urgent');
    } else {
      pill.classList.remove('urgent');
    }
    if (gameBreakRemaining <= 0) {
      clearInterval(gameTimerInterval);
      showBreakOverScreen();
    }
  }, 500);
}

function showGamePicker() {
  $('gamePicker').style.display = '';
  $('gameArea').style.display = 'none';
  $('breakOverScreen').style.display = 'none';
  stopActiveGame();
}

function showBreakOverScreen() {
  stopActiveGame();
  clearInterval(gameTimerInterval);
  $('gamePicker').style.display = 'none';
  $('gameArea').style.display = 'none';
  $('breakOverScreen').style.display = '';
}

$('gameCloseBtn').onclick = closeGamePanel;
$('backToGamesBtn').onclick = showGamePicker;
$('breakOverBtn').onclick = () => {
  closeGamePanel();
  if (cfg.autoWork) {
    setMode('work'); startTimer();
  } else {
    setMode('work');
    showToast('Break over! Ready to focus? ▶');
  }
};

// Game card clicks
document.querySelectorAll('.game-card').forEach(card => {
  card.onclick = () => launchGame(card.dataset.game);
});

function launchGame(id) {
  $('gamePicker').style.display = 'none';
  $('gameArea').style.display = '';
  $('breakOverScreen').style.display = 'none';
  stopActiveGame();

  const names = { snake:'🐍 Snake', tictactoe:'❌ Tic Tac Toe', memory:'🃏 Memory Match',
    typing:'⌨️ Speed Typing', '2048':'🔢 2048', flappy:'🐦 Flappy Bird',
    wordle:'📝 Word Guess', breakout:'🧱 Breakout' };
  $('gameAreaTitle').textContent = names[id] || id;
  $('gameScoreBadge').textContent = 'Score: 0';
  $('gameCanvasWrap').innerHTML = '';

  switch(id) {
    case 'snake': activeGame = new SnakeGame(); break;
    case 'tictactoe': activeGame = new TicTacToeGame(); break;
    case 'memory': activeGame = new MemoryGame(); break;
    case 'typing': activeGame = new TypingGame(); break;
    case '2048': activeGame = new Game2048(); break;
    case 'flappy': activeGame = new FlappyGame(); break;
    case 'wordle': activeGame = new WordleGame(); break;
    case 'breakout': activeGame = new BreakoutGame(); break;
  }
}

function stopActiveGame() {
  if (activeGame && activeGame.destroy) activeGame.destroy();
  activeGame = null;
}

function setGameScore(s) {
  $('gameScoreBadge').textContent = 'Score: ' + s;
}

// ── SNAKE ──────────────────────────────────────────────────────────
class SnakeGame {
  constructor() {
    this.W = 280; this.H = 280; this.SZ = 14;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.wrap = $('gameCanvasWrap');
    this.wrap.appendChild(this.canvas);

    const hint = document.createElement('div');
    hint.className = 'game-hint';
    hint.textContent = 'Use arrow keys or WASD to move';
    this.wrap.appendChild(hint);

    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = '▶ Start / Restart';
    btn.onclick = () => this.startGame();
    this.wrap.appendChild(btn);

    this.loop = null;
    this.score = 0;
    this.onKey = e => this.handleKey(e);
    document.addEventListener('keydown', this.onKey);
    this.drawIdle();
  }
  drawIdle() {
    const ctx = this.ctx;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface2').trim() || '#f0eeea';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#888';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐍 Press Start to play', this.W/2, this.H/2);
  }
  startGame() {
    this.snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    this.dir = {x:1,y:0}; this.next = {x:1,y:0};
    this.food = this.randomFood();
    this.score = 0; this.alive = true;
    clearInterval(this.loop);
    this.loop = setInterval(() => this.update(), 120);
  }
  randomFood() {
    const cols = Math.floor(this.W/this.SZ), rows = Math.floor(this.H/this.SZ);
    return { x: Math.floor(Math.random()*cols), y: Math.floor(Math.random()*rows) };
  }
  handleKey(e) {
    const map = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
      w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0} };
    const d = map[e.key];
    if (d && !(d.x === -this.dir.x && d.y === -this.dir.y)) {
      this.next = d;
      e.preventDefault();
    }
  }
  update() {
    if (!this.alive) return;
    this.dir = this.next;
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    const cols = Math.floor(this.W/this.SZ), rows = Math.floor(this.H/this.SZ);
    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows ||
        this.snake.some(s => s.x === head.x && s.y === head.y)) {
      this.alive = false;
      this.drawDead();
      return;
    }
    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score++;
      setGameScore(this.score);
      this.food = this.randomFood();
    } else {
      this.snake.pop();
    }
    this.draw();
  }
  draw() {
    const ctx = this.ctx, SZ = this.SZ;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0,0,this.W,this.H);
    // Food
    ctx.fillStyle = '#e05a3a';
    ctx.beginPath();
    ctx.arc(this.food.x*SZ+SZ/2, this.food.y*SZ+SZ/2, SZ/2-1, 0, Math.PI*2);
    ctx.fill();
    // Snake
    this.snake.forEach((s,i) => {
      ctx.fillStyle = i === 0 ? '#3cba80' : '#2e9e6b';
      ctx.beginPath();
      ctx.roundRect(s.x*SZ+1, s.y*SZ+1, SZ-2, SZ-2, 3);
      ctx.fill();
    });
  }
  drawDead() {
    this.draw();
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', this.W/2, this.H/2-10);
    ctx.font = '15px sans-serif';
    ctx.fillText('Score: ' + this.score, this.W/2, this.H/2+18);
  }
  destroy() { clearInterval(this.loop); document.removeEventListener('keydown', this.onKey); }
}

// ── TIC TAC TOE ────────────────────────────────────────────────────
class TicTacToeGame {
  constructor() {
    this.board = Array(9).fill('');
    this.playerTurn = true;
    this.gameOver = false;
    this.score = 0;
    this.wrap = $('gameCanvasWrap');
    this.render();
  }
  render() {
    this.wrap.innerHTML = '';
    const status = document.createElement('div');
    status.className = 'ttt-status';
    status.id = 'tttStatus';
    status.textContent = this.gameOver ? '' : (this.playerTurn ? "Your turn (✕)" : "AI thinking...");
    this.wrap.appendChild(status);

    const grid = document.createElement('div');
    grid.className = 'ttt-grid';
    this.board.forEach((val, i) => {
      const cell = document.createElement('div');
      cell.className = 'ttt-cell' + (val ? ' taken' : '');
      cell.textContent = val;
      if (!val && !this.gameOver && this.playerTurn) {
        cell.onclick = () => this.play(i);
      }
      grid.appendChild(cell);
    });
    this.wrap.appendChild(grid);

    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = '↺ New Game';
    btn.onclick = () => { this.board = Array(9).fill(''); this.playerTurn = true; this.gameOver = false; this.render(); };
    this.wrap.appendChild(btn);
  }
  play(i) {
    if (this.board[i] || this.gameOver || !this.playerTurn) return;
    this.board[i] = '✕';
    const win = this.checkWin('✕');
    if (win) { this.score++; setGameScore(this.score); this.gameOver = true; this.showResult('🎉 You win!'); return; }
    if (this.board.every(c => c)) { this.showResult("🤝 Draw!"); return; }
    this.playerTurn = false;
    this.render();
    setTimeout(() => { this.aiMove(); }, 400);
  }
  aiMove() {
    // Try to win, then block, then random
    const mark = (m) => {
      for (let i = 0; i < 9; i++) {
        if (!this.board[i]) {
          this.board[i] = m;
          if (this.checkWin(m)) { this.board[i] = ''; return i; }
          this.board[i] = '';
        }
      }
      return -1;
    };
    let idx = mark('◯');
    if (idx === -1) idx = mark('✕');
    if (idx === -1) {
      const empty = this.board.map((v,i) => v?-1:i).filter(i=>i>=0);
      idx = empty[Math.floor(Math.random()*empty.length)];
    }
    this.board[idx] = '◯';
    this.playerTurn = true;
    if (this.checkWin('◯')) { this.gameOver = true; this.showResult('🤖 AI wins!'); return; }
    if (this.board.every(c => c)) { this.showResult("🤝 Draw!"); return; }
    this.render();
  }
  checkWin(m) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    return lines.some(l => l.every(i => this.board[i] === m));
  }
  showResult(msg) {
    this.render();
    const status = $('tttStatus') || this.wrap.querySelector('.ttt-status');
    if (status) status.textContent = msg;
  }
  destroy() {}
}

// ── MEMORY MATCH ──────────────────────────────────────────────────
class MemoryGame {
  constructor() {
    const emojis = ['🍎','🌟','🎸','🚀','🦋','🌈','🍕','🎲'];
    this.cards = [...emojis,...emojis].sort(() => Math.random()-0.5);
    this.revealed = Array(16).fill(false);
    this.matched = Array(16).fill(false);
    this.flipped = [];
    this.locked = false;
    this.score = 0;
    this.wrap = $('gameCanvasWrap');
    this.render();
  }
  render() {
    this.wrap.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'memory-grid';
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    this.cards.forEach((emoji, i) => {
      const card = document.createElement('button');
      card.className = 'mem-card' + (this.revealed[i] ? ' revealed' : '') + (this.matched[i] ? ' matched' : '');
      card.textContent = (this.revealed[i] || this.matched[i]) ? emoji : '?';
      card.onclick = () => this.flip(i);
      grid.appendChild(card);
    });
    this.wrap.appendChild(grid);
    const hint = document.createElement('div');
    hint.className = 'game-hint';
    hint.textContent = `Pairs found: ${this.score} / 8`;
    this.wrap.appendChild(hint);
  }
  flip(i) {
    if (this.locked || this.revealed[i] || this.matched[i]) return;
    this.revealed[i] = true;
    this.flipped.push(i);
    this.render();
    if (this.flipped.length === 2) {
      this.locked = true;
      const [a,b] = this.flipped;
      if (this.cards[a] === this.cards[b]) {
        this.matched[a] = this.matched[b] = true;
        this.score++;
        setGameScore(this.score);
        this.flipped = [];
        this.locked = false;
        this.render();
        if (this.matched.every(m => m)) {
          setTimeout(() => {
            this.wrap.innerHTML = '';
            const msg = document.createElement('div');
            msg.style.cssText = 'text-align:center;padding:40px;font-size:24px;';
            msg.textContent = '🎉 You matched all pairs!';
            this.wrap.appendChild(msg);
          }, 500);
        }
      } else {
        setTimeout(() => {
          this.revealed[a] = this.revealed[b] = false;
          this.flipped = [];
          this.locked = false;
          this.render();
        }, 800);
      }
    }
  }
  destroy() {}
}

// ── SPEED TYPING ──────────────────────────────────────────────────
class TypingGame {
  constructor() {
    const sentences = [
      "The quick brown fox jumps over the lazy dog",
      "Focus and consistency lead to extraordinary results",
      "Every expert was once a beginner who never quit",
      "Small progress every day adds up to big results",
      "Success is the sum of small efforts repeated daily",
      "Believe in yourself and you are halfway there",
      "The harder you work the luckier you get",
      "Start where you are use what you have do what you can"
    ];
    this.prompt = sentences[Math.floor(Math.random()*sentences.length)];
    this.typed = '';
    this.started = false;
    this.startTime = null;
    this.finished = false;
    this.wrap = $('gameCanvasWrap');
    this.render();
  }
  render() {
    this.wrap.innerHTML = '';
    this.wrap.style.width = '100%';

    const wrap2 = document.createElement('div');
    wrap2.className = 'typing-wrap';

    const promptEl = document.createElement('div');
    promptEl.className = 'typing-prompt';
    let html = '';
    for (let i = 0; i < this.prompt.length; i++) {
      if (i < this.typed.length) {
        const correct = this.typed[i] === this.prompt[i];
        html += `<span class="${correct?'correct':'wrong'}">${escHtml2(this.prompt[i])}</span>`;
      } else {
        html += `<span>${escHtml2(this.prompt[i])}</span>`;
      }
    }
    promptEl.innerHTML = html;
    wrap2.appendChild(promptEl);

    const input = document.createElement('input');
    input.className = 'typing-input';
    input.placeholder = 'Start typing here…';
    input.value = this.typed;
    input.oninput = (e) => this.onInput(e.target.value);
    input.disabled = this.finished;
    wrap2.appendChild(input);

    const stats = document.createElement('div');
    stats.className = 'typing-stats';
    stats.innerHTML = `<span>WPM: <span class="typing-stat-val" id="wpmVal">—</span></span>
      <span>Accuracy: <span class="typing-stat-val" id="accVal">—</span></span>`;
    wrap2.appendChild(stats);

    this.wrap.appendChild(wrap2);

    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = '↺ New Prompt';
    btn.onclick = () => { activeGame = new TypingGame(); };
    this.wrap.appendChild(btn);

    if (!this.finished) setTimeout(() => input.focus(), 50);
  }
  onInput(val) {
    if (!this.started) { this.started = true; this.startTime = Date.now(); }
    this.typed = val;
    if (val.length >= this.prompt.length) {
      this.finished = true;
      const elapsed = (Date.now() - this.startTime) / 60000;
      const words = this.prompt.split(' ').length;
      const wpm = Math.round(words / elapsed);
      let correct = 0;
      for (let i = 0; i < this.typed.length && i < this.prompt.length; i++) {
        if (this.typed[i] === this.prompt[i]) correct++;
      }
      const acc = Math.round((correct / this.prompt.length) * 100);
      setGameScore(wpm + ' WPM');
      this.render();
      const wpmEl = $('wpmVal'), accEl = $('accVal');
      if (wpmEl) wpmEl.textContent = wpm;
      if (accEl) accEl.textContent = acc + '%';
    } else {
      this.render();
    }
  }
  destroy() {}
}
function escHtml2(s) { return s === '<' ? '&lt;' : s === '>' ? '&gt;' : s === '&' ? '&amp;' : s; }

// ── 2048 ───────────────────────────────────────────────────────────
class Game2048 {
  constructor() {
    this.grid = Array.from({length:4}, () => Array(4).fill(0));
    this.score = 0;
    this.addTile(); this.addTile();
    this.wrap = $('gameCanvasWrap');
    this.onKey = e => this.handleKey(e);
    document.addEventListener('keydown', this.onKey);
    // Touch support
    this.touchStart = null;
    this.onTouchStart = e => { this.touchStart = e.touches[0]; };
    this.onTouchEnd = e => {
      if (!this.touchStart) return;
      const dx = e.changedTouches[0].clientX - this.touchStart.clientX;
      const dy = e.changedTouches[0].clientY - this.touchStart.clientY;
      if (Math.abs(dx) > Math.abs(dy)) { if (dx > 30) this.move('right'); else if (dx < -30) this.move('left'); }
      else { if (dy > 30) this.move('down'); else if (dy < -30) this.move('up'); }
    };
    this.wrap.addEventListener('touchstart', this.onTouchStart);
    this.wrap.addEventListener('touchend', this.onTouchEnd);
    this.render();
  }
  addTile() {
    const empty = [];
    for (let r=0;r<4;r++) for (let c=0;c<4;c++) if (!this.grid[r][c]) empty.push([r,c]);
    if (!empty.length) return;
    const [r,c] = empty[Math.floor(Math.random()*empty.length)];
    this.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }
  render() {
    this.wrap.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.className = 'g2048-grid';
    const colors = {0:'#ccc2b4',2:'#eee4da',4:'#ede0c8',8:'#f2b179',16:'#f59563',32:'#f67c5f',
      64:'#f65e3b',128:'#edcf72',256:'#edcc61',512:'#edc850',1024:'#edc53f',2048:'#edc22e'};
    const textColors = {0:'transparent',2:'#776e65',4:'#776e65'};
    this.grid.forEach(row => {
      row.forEach(val => {
        const cell = document.createElement('div');
        cell.className = 'g2048-cell';
        cell.style.background = colors[val] || '#3c3a32';
        cell.style.color = textColors[val] || '#f9f6f2';
        cell.style.fontSize = val > 999 ? '14px' : val > 99 ? '18px' : '22px';
        cell.textContent = val || '';
        gridEl.appendChild(cell);
      });
    });
    this.wrap.appendChild(gridEl);
    const hint = document.createElement('div');
    hint.className = 'game-hint';
    hint.textContent = 'Arrow keys or swipe to move tiles';
    this.wrap.appendChild(hint);
    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = '↺ New Game';
    btn.onclick = () => { activeGame = new Game2048(); };
    this.wrap.appendChild(btn);
  }
  handleKey(e) {
    const map = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
    if (map[e.key]) { this.move(map[e.key]); e.preventDefault(); }
  }
  move(dir) {
    const prev = JSON.stringify(this.grid);
    if (dir === 'left') this.grid = this.grid.map(r => this.mergeRow(r));
    if (dir === 'right') this.grid = this.grid.map(r => this.mergeRow([...r].reverse()).reverse());
    if (dir === 'up') {
      this.grid = this.transpose(this.grid).map(r => this.mergeRow(r));
      this.grid = this.transpose(this.grid);
    }
    if (dir === 'down') {
      this.grid = this.transpose(this.grid).map(r => this.mergeRow([...r].reverse()).reverse());
      this.grid = this.transpose(this.grid);
    }
    if (JSON.stringify(this.grid) !== prev) { this.addTile(); setGameScore(this.score); this.render(); }
  }
  transpose(g) { return g[0].map((_,c) => g.map(r => r[c])); }
  mergeRow(row) {
    const nums = row.filter(v => v);
    for (let i=0; i<nums.length-1; i++) {
      if (nums[i] === nums[i+1]) { nums[i] *= 2; this.score += nums[i]; nums.splice(i+1,1); }
    }
    while (nums.length < 4) nums.push(0);
    return nums;
  }
  destroy() {
    document.removeEventListener('keydown', this.onKey);
    this.wrap.removeEventListener('touchstart', this.onTouchStart);
    this.wrap.removeEventListener('touchend', this.onTouchEnd);
  }
}

// ── FLAPPY BIRD ────────────────────────────────────────────────────
class FlappyGame {
  constructor() {
    this.W = 280; this.H = 320;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.wrap = $('gameCanvasWrap');
    this.wrap.appendChild(this.canvas);
    const hint = document.createElement('div');
    hint.className = 'game-hint';
    hint.textContent = 'Click / Tap / Space to flap';
    this.wrap.appendChild(hint);
    this.running = false; this.score = 0;
    this.bird = { y: this.H/2, vy: 0 };
    this.pipes = [];
    this.pipeTimer = 0;
    this.raf = null;
    this.onClick = () => this.flap();
    this.onSpace = e => { if (e.code === 'Space') { this.flap(); e.preventDefault(); } };
    this.canvas.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onSpace);
    this.drawIdle();
  }
  drawIdle() {
    const ctx = this.ctx;
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(0,this.H-40,this.W,40);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap to start!', this.W/2, this.H/2);
    this.drawBird(ctx, 60, this.H/2);
  }
  drawBird(ctx, x, y) {
    ctx.fillStyle = '#f7c948';
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 11, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#e05a3a';
    ctx.beginPath();
    ctx.moveTo(x+10, y); ctx.lineTo(x+18, y-3); ctx.lineTo(x+18, y+3); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x+4, y-3, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(x+5, y-3, 2, 0, Math.PI*2); ctx.fill();
  }
  flap() {
    if (!this.running) { this.startGame(); return; }
    this.bird.vy = -5.5;
  }
  startGame() {
    this.running = true; this.score = 0; this.pipes = [];
    this.bird = { y: this.H/2, vy: 0 }; this.pipeTimer = 0;
    cancelAnimationFrame(this.raf);
    this.gameLoop();
  }
  gameLoop() {
    this.update();
    this.draw();
    if (this.running) this.raf = requestAnimationFrame(() => this.gameLoop());
  }
  update() {
    this.bird.vy += 0.35;
    this.bird.y += this.bird.vy;
    this.pipeTimer++;
    if (this.pipeTimer > 90) {
      this.pipeTimer = 0;
      const gap = 80, top = 40 + Math.random()*(this.H - gap - 80);
      this.pipes.push({ x: this.W, top, gap });
    }
    this.pipes.forEach(p => p.x -= 2.5);
    this.pipes = this.pipes.filter(p => p.x > -40);
    // Collision
    const bx = 60, by = this.bird.y;
    if (by < 10 || by > this.H - 50) { this.gameOver(); return; }
    for (const p of this.pipes) {
      if (bx+10 > p.x && bx-10 < p.x+40 && (by-11 < p.top || by+11 > p.top+p.gap)) {
        this.gameOver(); return;
      }
      if (!p.passed && p.x + 40 < bx) {
        p.passed = true; this.score++;
        setGameScore(this.score);
      }
    }
  }
  draw() {
    const ctx = this.ctx;
    // Sky
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0,0,this.W,this.H);
    // Ground
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(0,this.H-40,this.W,40);
    ctx.fillStyle = '#66bb6a';
    ctx.fillRect(0,this.H-45,this.W,8);
    // Pipes
    ctx.fillStyle = '#4caf50';
    ctx.strokeStyle = '#388e3c';
    ctx.lineWidth = 2;
    this.pipes.forEach(p => {
      ctx.fillRect(p.x, 0, 40, p.top);
      ctx.strokeRect(p.x, 0, 40, p.top);
      ctx.fillRect(p.x-4, p.top-14, 48, 14);
      ctx.fillRect(p.x, p.top+p.gap, 40, this.H-p.top-p.gap);
      ctx.strokeRect(p.x, p.top+p.gap, 40, this.H-p.top-p.gap);
      ctx.fillRect(p.x-4, p.top+p.gap, 48, 14);
    });
    // Bird
    this.drawBird(ctx, 60, this.bird.y);
    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.score, this.W/2, 36);
  }
  gameOver() {
    this.running = false;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', this.W/2, this.H/2-12);
    ctx.font = '16px sans-serif';
    ctx.fillText('Score: ' + this.score + ' — Tap to retry', this.W/2, this.H/2+18);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onSpace);
  }
}

// ── WORDLE ────────────────────────────────────────────────────────
class WordleGame {
  constructor() {
    const words = ['BRAVE','CHAIR','DEPOT','ELDER','FLAME','GLOBE','HORSE','IRONY',
      'JOKER','KNIFE','LEMON','MANGO','NOBLE','OCEAN','PIANO','QUEEN','RIVER','SOLAR',
      'TIGER','ULTRA','VIGOR','WATER','XENON','YACHT','ZEBRA','ABOUT','ABOVE','ABUSE',
      'ADULT','AFTER','AGAIN','AGENT','AGILE','ALARM','ALBUM','ALERT'];
    this.word = words[Math.floor(Math.random()*words.length)];
    this.guesses = [];
    this.current = '';
    this.maxGuesses = 6;
    this.done = false;
    this.message = '';
    this.wrap = $('gameCanvasWrap');
    this.onKey = e => this.handleKey(e);
    document.addEventListener('keydown', this.onKey);
    this.render();
  }
  handleKey(e) {
    if (this.done) return;
    if (e.key === 'Enter') { this.submit(); return; }
    if (e.key === 'Backspace') { this.current = this.current.slice(0,-1); this.render(); return; }
    if (/^[a-zA-Z]$/.test(e.key) && this.current.length < 5) {
      this.current += e.key.toUpperCase(); this.render();
    }
  }
  submit() {
    if (this.current.length !== 5) { this.message = 'Need 5 letters!'; this.render(); return; }
    this.guesses.push(this.current);
    if (this.current === this.word) { this.done = true; this.message = '🎉 Brilliant!'; setGameScore(7 - this.guesses.length); }
    else if (this.guesses.length >= this.maxGuesses) { this.done = true; this.message = 'Word was: ' + this.word; }
    this.current = '';
    this.render();
  }
  getHints(guess) {
    const result = Array(5).fill('absent');
    const wordArr = this.word.split('');
    const guessArr = guess.split('');
    // Mark correct
    guessArr.forEach((c,i) => { if (c === wordArr[i]) { result[i] = 'correct'; wordArr[i] = null; guessArr[i] = null; } });
    // Mark present
    guessArr.forEach((c,i) => {
      if (c === null) return;
      const wi = wordArr.indexOf(c);
      if (wi !== -1) { result[i] = 'present'; wordArr[wi] = null; }
    });
    return result;
  }
  render() {
    this.wrap.innerHTML = '';
    // Grid
    const grid = document.createElement('div');
    grid.className = 'wordle-grid';
    for (let r = 0; r < this.maxGuesses; r++) {
      const row = document.createElement('div');
      row.className = 'wordle-row';
      const guess = this.guesses[r];
      const isCurrent = r === this.guesses.length && !this.done;
      for (let c = 0; c < 5; c++) {
        const cell = document.createElement('div');
        cell.className = 'wordle-cell';
        if (guess) {
          const hints = this.getHints(guess);
          cell.classList.add(hints[c]);
          cell.textContent = guess[c];
        } else if (isCurrent) {
          cell.classList.add('active-row');
          cell.textContent = this.current[c] || '';
        }
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
    this.wrap.appendChild(grid);

    if (this.message) {
      const msg = document.createElement('div');
      msg.style.cssText = 'text-align:center;font-weight:700;font-size:15px;color:var(--text);margin-top:6px;';
      msg.textContent = this.message;
      this.wrap.appendChild(msg);
    }

    // Keyboard
    const keyStates = {};
    this.guesses.forEach(guess => {
      const hints = this.getHints(guess);
      guess.split('').forEach((c,i) => {
        const h = hints[i];
        if (h === 'correct') keyStates[c] = 'correct';
        else if (h === 'present' && keyStates[c] !== 'correct') keyStates[c] = 'present';
        else if (!keyStates[c]) keyStates[c] = 'absent';
      });
    });

    const kb = document.createElement('div');
    kb.className = 'wordle-keyboard';
    [['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['ENTER','Z','X','C','V','B','N','M','⌫']].forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'wordle-key-row';
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'wordle-key' + (['ENTER','⌫'].includes(key) ? ' wide' : '');
        btn.textContent = key;
        if (keyStates[key]) btn.classList.add(keyStates[key]);
        btn.onclick = () => {
          if (key === 'ENTER') this.submit();
          else if (key === '⌫') { this.current = this.current.slice(0,-1); this.render(); }
          else if (!this.done && this.current.length < 5) { this.current += key; this.render(); }
        };
        rowEl.appendChild(btn);
      });
      kb.appendChild(rowEl);
    });
    this.wrap.appendChild(kb);

    if (this.done) {
      const btn = document.createElement('button');
      btn.className = 'game-btn';
      btn.style.marginTop = '10px';
      btn.textContent = '↺ New Word';
      btn.onclick = () => { activeGame = new WordleGame(); };
      this.wrap.appendChild(btn);
    }
  }
  destroy() { document.removeEventListener('keydown', this.onKey); }
}

// ── BREAKOUT ──────────────────────────────────────────────────────
class BreakoutGame {
  constructor() {
    this.W = 280; this.H = 320;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.wrap = $('gameCanvasWrap');
    this.wrap.appendChild(this.canvas);
    const hint = document.createElement('div');
    hint.className = 'game-hint';
    hint.textContent = 'Move mouse / touch to control paddle';
    this.wrap.appendChild(hint);
    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = '▶ Start / Restart';
    btn.onclick = () => this.startGame();
    this.wrap.appendChild(btn);
    this.running = false;
    this.score = 0;
    this.raf = null;
    this.onMouseMove = e => {
      const rect = this.canvas.getBoundingClientRect();
      this.paddle.x = Math.max(0, Math.min(this.W - this.paddle.w, e.clientX - rect.left - this.paddle.w/2));
    };
    this.onTouch = e => {
      const rect = this.canvas.getBoundingClientRect();
      this.paddle.x = Math.max(0, Math.min(this.W - this.paddle.w, e.touches[0].clientX - rect.left - this.paddle.w/2));
      e.preventDefault();
    };
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('touchmove', this.onTouch, {passive:false});
    this.initIdle();
  }
  initIdle() {
    this.paddle = { x: this.W/2-30, y: this.H-20, w: 60, h: 8 };
    this.ball = { x: this.W/2, y: this.H-50, r: 7, vx: 2.5, vy: -2.5 };
    this.bricks = [];
    const colors = ['#e05a3a','#f59e0b','#2e9e6b','#2563eb','#a855f7'];
    for (let r=0;r<4;r++) for (let c=0;c<7;c++) {
      this.bricks.push({ x: 10+c*38, y: 30+r*22, w: 32, h: 14, alive: true, color: colors[r%colors.length] });
    }
    this.drawIdle();
  }
  drawIdle() {
    this.draw();
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press Start to play!', this.W/2, this.H/2);
  }
  startGame() {
    this.running = true; this.score = 0;
    this.paddle = { x: this.W/2-30, y: this.H-20, w: 60, h: 8 };
    this.ball = { x: this.W/2, y: this.H-50, r: 7, vx: 2.5, vy: -2.5 };
    this.bricks = [];
    const colors = ['#e05a3a','#f59e0b','#2e9e6b','#2563eb','#a855f7'];
    for (let r=0;r<4;r++) for (let c=0;c<7;c++) {
      this.bricks.push({ x: 10+c*38, y: 30+r*22, w: 32, h: 14, alive: true, color: colors[r%colors.length] });
    }
    cancelAnimationFrame(this.raf);
    this.gameLoop();
  }
  gameLoop() {
    this.update();
    this.draw();
    if (this.running) this.raf = requestAnimationFrame(() => this.gameLoop());
  }
  update() {
    const b = this.ball, p = this.paddle;
    b.x += b.vx; b.y += b.vy;
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
    if (b.x + b.r > this.W) { b.x = this.W - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }
    if (b.y + b.r > this.H) { this.running = false; this.drawGameOver(); return; }
    if (b.y + b.r >= p.y && b.y - b.r <= p.y + p.h && b.x >= p.x && b.x <= p.x+p.w) {
      b.vy = -Math.abs(b.vy);
      b.vx += (b.x - (p.x+p.w/2)) * 0.08;
    }
    this.bricks.forEach(br => {
      if (!br.alive) return;
      if (b.x+b.r > br.x && b.x-b.r < br.x+br.w && b.y+b.r > br.y && b.y-b.r < br.y+br.h) {
        br.alive = false; this.score += 10; setGameScore(this.score); b.vy = -b.vy;
      }
    });
    if (this.bricks.every(b => !b.alive)) { this.running = false; this.drawWin(); }
  }
  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0,0,this.W,this.H);
    this.bricks.forEach(br => {
      if (!br.alive) return;
      ctx.fillStyle = br.color;
      ctx.beginPath();
      ctx.roundRect(br.x, br.y, br.w, br.h, 3);
      ctx.fill();
    });
    ctx.fillStyle = '#4a90d9';
    ctx.beginPath();
    ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + this.score, 8, 18);
  }
  drawGameOver() {
    this.draw();
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', this.W/2, this.H/2-10);
    ctx.font = '14px sans-serif';
    ctx.fillText('Score: ' + this.score, this.W/2, this.H/2+16);
  }
  drawWin() {
    this.draw();
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎉 You cleared it!', this.W/2, this.H/2);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('touchmove', this.onTouch);
  }
}

// ── Init ───────────────────────────────────────────────────────────
loadCfg(); loadStats(); applyTheme();
applyGradient();
setMode('work'); renderDots(); renderStats(); renderTasks();