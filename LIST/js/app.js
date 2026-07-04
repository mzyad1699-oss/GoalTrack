import supabaseClient from './supabaseClient.js';
import { Auth } from './auth.js';
import { DB } from './database.js';
import {
  DAY_NAMES_AR,
  generateId,
  toISODate,
  getWeekDates,
  calcPercentage,
  formatArabicDate,
  showToast,
  debounce,
} from './utils.js';
import { renderCompass, renderDayStones, renderTaskCard, renderGoalManagerRow } from './components.js';
import { renderWeeklyPointsChart } from './charts.js';

// ============================================================
// حالة التطبيق (State)
// ============================================================
const state = {
  user: null,
  goals: [],
  tasksByDate: {}, // { '2026-07-05': { goalId: taskRow } }
  restDays: new Set(),
  weekDates: getWeekDates(),
  selectedDate: toISODate(new Date()),
  weekNotes: null,
};

const el = (id) => document.getElementById(id);

// ============================================================
// نقطة الدخول
// ============================================================
async function init() {
  applySavedTheme();
  bindAuthForms();
  bindStaticEvents();

  Auth.onAuthStateChange(async (user) => {
    state.user = user;
    if (user) {
      el('auth-screen').classList.add('hidden');
      el('app-shell').classList.remove('hidden');
      await loadEverything();
    } else {
      el('app-shell').classList.add('hidden');
      el('auth-screen').classList.remove('hidden');
    }
  });

  const existingUser = await Auth.getCurrentUser();
  state.user = existingUser;
  if (existingUser) {
    el('auth-screen').classList.add('hidden');
    el('app-shell').classList.remove('hidden');
    await loadEverything();
  }
}

// ============================================================
// المصادقة: ربط النماذج
// ============================================================
function bindAuthForms() {
  el('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Auth.signIn(el('login-email').value, el('login-password').value);
    } catch (err) {
      showToast(err.message || 'تعذر تسجيل الدخول', 'error');
    }
  });

  el('form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Auth.signUp(el('signup-email').value, el('signup-password').value, el('signup-name').value);
      showToast('تم إنشاء الحساب! تحقق من بريدك الإلكتروني للتأكيد', 'success');
      switchAuthTab('login');
    } catch (err) {
      showToast(err.message || 'تعذر إنشاء الحساب', 'error');
    }
  });

  el('btn-google').addEventListener('click', async () => {
    try {
      await Auth.signInWithGoogle();
    } catch (err) {
      showToast(err.message || 'تعذر تسجيل الدخول بجوجل', 'error');
    }
  });

  el('link-forgot').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = prompt('اكتب بريدك الإلكتروني لإرسال رابط إعادة التعيين:');
    if (!email) return;
    try {
      await Auth.resetPassword(email);
      showToast('تم إرسال رابط إعادة التعيين إلى بريدك', 'success');
    } catch (err) {
      showToast(err.message || 'تعذر إرسال الرابط', 'error');
    }
  });

  el('tab-login').addEventListener('click', () => switchAuthTab('login'));
  el('tab-signup').addEventListener('click', () => switchAuthTab('signup'));
}

function switchAuthTab(tab) {
  el('form-login').classList.toggle('hidden', tab !== 'login');
  el('form-signup').classList.toggle('hidden', tab !== 'signup');
  el('tab-login').classList.toggle('is-active', tab === 'login');
  el('tab-signup').classList.toggle('is-active', tab === 'signup');
}

// ============================================================
// أحداث ثابتة في الواجهة (تسجيل خروج، ثيم، إضافة هدف...)
// ============================================================
function bindStaticEvents() {
  el('btn-logout').addEventListener('click', async () => {
    await Auth.signOut();
    showToast('تم تسجيل الخروج', 'success');
  });

  el('btn-theme-toggle').addEventListener('click', toggleTheme);

  el('btn-add-goal').addEventListener('click', async () => {
    const name = el('new-goal-name').value.trim();
    const points = parseInt(el('new-goal-points').value, 10) || 10;
    if (!name) return showToast('اكتب اسم الهدف أولًا', 'error');

    const goal = {
      id: generateId(),
      user_id: state.user.id,
      name,
      points,
      color: randomAccentColor(),
      is_active: true,
      sort_order: state.goals.length,
    };
    state.goals.push(goal);
    await DB.upsertRow('goals', goal);
    el('new-goal-name').value = '';
    el('new-goal-points').value = '';
    renderAll();
    showToast('تمت إضافة الهدف 🎯', 'success');
  });

  el('btn-toggle-rest').addEventListener('click', async () => {
    const date = state.selectedDate;
    if (state.restDays.has(date)) {
      state.restDays.delete(date);
      const rowId = restDayId(date);
      await DB.deleteRow('rest_days', rowId);
    } else {
      state.restDays.add(date);
      await DB.upsertRow('rest_days', { id: restDayId(date), user_id: state.user.id, rest_date: date, note: '' });
    }
    renderAll();
  });

  // ملاحظات الأسبوع: حفظ تلقائي أثناء الكتابة
  ['week-note-best', 'week-note-worst', 'week-note-challenge', 'week-note-improve', 'week-note-general'].forEach(
    (id) => {
      el(id).addEventListener('input', debounce(saveWeekNotes, 600));
    }
  );

  // تفويض الأحداث لبطاقات المهام (checkbox / notes / priority / time)
  el('tasks-container').addEventListener('change', handleTaskFieldChange);
  el('tasks-container').addEventListener(
    'input',
    debounce((e) => {
      if (e.target.classList.contains('js-task-notes')) handleTaskFieldChange(e);
    }, 500)
  );

  el('goals-manager-list').addEventListener('click', handleGoalManagerClick);
  el('goals-manager-list').addEventListener(
    'change',
    debounce(handleGoalManagerChange, 400)
  );
}

function restDayId(date) {
  // معرف ثابت مبني على المستخدم والتاريخ حتى لا يتكرر نفس اليوم
  return `${state.user.id}-${date}`;
}

function randomAccentColor() {
  const palette = ['#2DD4BF', '#F5B942', '#FF6B5C', '#7C9CFF', '#B98CF0', '#4ADE80'];
  return palette[Math.floor(Math.random() * palette.length)];
}

// ============================================================
// تحميل البيانات
// ============================================================
async function loadEverything() {
  const [goals, tasks, restDays, weekNotes] = await Promise.all([
    DB.fetchTable('goals', (g) => g.user_id === state.user.id),
    DB.fetchTable('tasks', (t) => t.user_id === state.user.id),
    DB.fetchTable('rest_days', (r) => r.user_id === state.user.id),
    DB.fetchTable('week_notes', (w) => w.user_id === state.user.id),
  ]);

  state.goals = goals.sort((a, b) => a.sort_order - b.sort_order);
  state.restDays = new Set(restDays.map((r) => r.rest_date));

  state.tasksByDate = {};
  tasks.forEach((t) => {
    if (!state.tasksByDate[t.task_date]) state.tasksByDate[t.task_date] = {};
    state.tasksByDate[t.task_date][t.goal_id] = t;
  });

  const currentWeekStart = state.weekDates[0];
  state.weekNotes = weekNotes.find((w) => w.week_start === currentWeekStart) || null;

  renderAll();
}

// ============================================================
// التعامل مع تغييرات بطاقات المهام
// ============================================================
async function handleTaskFieldChange(e) {
  const goalId = e.target.dataset.goalId;
  if (!goalId) return;
  const date = state.selectedDate;
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;

  const existing = state.tasksByDate[date]?.[goalId];
  const task = existing || {
    id: generateId(),
    user_id: state.user.id,
    goal_id: goalId,
    task_date: date,
    is_completed: false,
    notes: '',
    time_of_day: null,
    priority: 'medium',
    points_earned: 0,
  };

  if (e.target.classList.contains('js-task-toggle')) {
    task.is_completed = e.target.checked;
    task.points_earned = task.is_completed ? goal.points : 0;
  } else if (e.target.classList.contains('js-task-notes')) {
    task.notes = e.target.value;
  } else if (e.target.classList.contains('js-task-priority')) {
    task.priority = e.target.value;
  } else if (e.target.classList.contains('js-task-time')) {
    task.time_of_day = e.target.value || null;
  }

  if (!state.tasksByDate[date]) state.tasksByDate[date] = {};
  state.tasksByDate[date][goalId] = task;

  await DB.upsertRow('tasks', task);

  if (e.target.classList.contains('js-task-toggle')) {
    renderAll();
    if (task.is_completed) celebrateTaskDone();
  } else {
    renderHero(); // تحديث الأرقام فقط بدون إعادة رسم كل البطاقات
  }
}

function celebrateTaskDone() {
  const card = document.querySelector('.task-card--done');
  if (!card) return;
  card.classList.add('task-card--pulse');
  setTimeout(() => card.classList.remove('task-card--pulse'), 500);
}

// ============================================================
// إدارة الأهداف (تعديل / حذف)
// ============================================================
async function handleGoalManagerClick(e) {
  if (e.target.classList.contains('js-goal-delete')) {
    const goalId = e.target.dataset.goalId;
    if (!confirm('هل تريد حذف هذا الهدف نهائيًا؟')) return;
    state.goals = state.goals.filter((g) => g.id !== goalId);
    await DB.deleteRow('goals', goalId);
    renderAll();
    showToast('تم حذف الهدف', 'success');
  }
}

async function handleGoalManagerChange(e) {
  const goalId = e.target.dataset.goalId;
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;
  if (e.target.classList.contains('js-goal-name')) goal.name = e.target.value.trim();
  if (e.target.classList.contains('js-goal-points')) goal.points = parseInt(e.target.value, 10) || 1;
  await DB.upsertRow('goals', goal);
  renderHero();
}

// ============================================================
// ملاحظات الأسبوع
// ============================================================
async function saveWeekNotes() {
  const weekStart = state.weekDates[0];
  const notes = state.weekNotes || {
    id: `${state.user.id}-${weekStart}`,
    user_id: state.user.id,
    week_start: weekStart,
  };
  notes.best_thing = el('week-note-best').value;
  notes.worst_thing = el('week-note-worst').value;
  notes.biggest_challenge = el('week-note-challenge').value;
  notes.next_improvement = el('week-note-improve').value;
  notes.general_notes = el('week-note-general').value;
  state.weekNotes = notes;
  await DB.upsertRow('week_notes', notes);
}

// ============================================================
// الحسابات
// ============================================================
function computeDayCompletion(date) {
  const dayTasks = state.tasksByDate[date] || {};
  const activeGoals = state.goals.filter((g) => g.is_active);
  if (activeGoals.length === 0) return null;
  const done = activeGoals.filter((g) => dayTasks[g.id]?.is_completed).length;
  return calcPercentage(done, activeGoals.length);
}

function computeWeekTotals() {
  const activeGoals = state.goals.filter((g) => g.is_active);
  let pointsEarned = 0;
  let pointsTotal = 0;
  let doneCount = 0;
  let totalCount = 0;
  const pointsPerDay = [];

  state.weekDates.forEach((date) => {
    if (state.restDays.has(date)) {
      pointsPerDay.push(0);
      return;
    }
    const dayTasks = state.tasksByDate[date] || {};
    let dayPoints = 0;
    activeGoals.forEach((goal) => {
      totalCount += 1;
      pointsTotal += goal.points;
      const task = dayTasks[goal.id];
      if (task?.is_completed) {
        doneCount += 1;
        pointsEarned += goal.points;
        dayPoints += goal.points;
      }
    });
    pointsPerDay.push(dayPoints);
  });

  return {
    percentage: calcPercentage(doneCount, totalCount),
    pointsEarned,
    pointsTotal,
    pointsPerDay,
  };
}

// ============================================================
// الرسم (Rendering)
// ============================================================
function renderAll() {
  renderHero();
  renderGoalsManager();
  renderTasksForSelectedDay();
  renderWeekNotesFields();
}

function renderHero() {
  const totals = computeWeekTotals();
  el('compass-container').innerHTML = renderCompass(totals.percentage, totals.pointsEarned, totals.pointsTotal);

  const completionMap = {};
  state.weekDates.forEach((d) => {
    completionMap[d] = computeDayCompletion(d);
  });
  el('day-path-container').innerHTML = renderDayStones(
    state.weekDates,
    completionMap,
    state.restDays,
    state.selectedDate
  );
  document.querySelectorAll('.day-stone').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedDate = btn.dataset.date;
      renderAll();
    });
  });

  el('week-range-label').textContent = `${formatArabicDate(state.weekDates[0])} — ${formatArabicDate(
    state.weekDates[6]
  )}`;
  el('selected-day-label').textContent = formatArabicDate(state.selectedDate);
  el('btn-toggle-rest').textContent = state.restDays.has(state.selectedDate)
    ? '↺ إلغاء يوم الراحة'
    : '☕ اجعله يوم راحة';

  renderWeeklyPointsChart('weekly-points-chart', totals.pointsPerDay);
}

function renderGoalsManager() {
  el('goals-manager-list').innerHTML = state.goals.map(renderGoalManagerRow).join('') || emptyState('لا توجد أهداف بعد، أضف أول هدف لك 🎯');
}

function renderTasksForSelectedDay() {
  const activeGoals = state.goals.filter((g) => g.is_active);
  if (activeGoals.length === 0) {
    el('tasks-container').innerHTML = emptyState('أضف أهدافك أولًا من قسم "إدارة الأهداف" بالأسفل');
    return;
  }
  const isRest = state.restDays.has(state.selectedDate);
  const dayTasks = state.tasksByDate[state.selectedDate] || {};
  el('tasks-container').innerHTML =
    (isRest ? `<p class="rest-day-banner">🌿 هذا يوم راحة — أي مهام تنجزها اليوم اختيارية ولا تؤثر على نسبتك</p>` : '') +
    activeGoals.map((goal) => renderTaskCard(goal, dayTasks[goal.id])).join('');
}

function renderWeekNotesFields() {
  const n = state.weekNotes;
  el('week-note-best').value = n?.best_thing || '';
  el('week-note-worst').value = n?.worst_thing || '';
  el('week-note-challenge').value = n?.biggest_challenge || '';
  el('week-note-improve').value = n?.next_improvement || '';
  el('week-note-general').value = n?.general_notes || '';
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

// ============================================================
// الثيم (فاتح / داكن)
// ============================================================
function applySavedTheme() {
  const saved = localStorage.getItem('goaltrack_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('goaltrack_theme', next);
}

// ============================================================
// تشغيل
// ============================================================
document.addEventListener('DOMContentLoaded', init);
