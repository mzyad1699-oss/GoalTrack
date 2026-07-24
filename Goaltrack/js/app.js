import supabaseClient from './supabaseClient.js';
import { Auth } from './auth.js';
import { DB } from './database.js';
import {
  generateId,
  toISODate,
  getWeekDates,
  calcPercentage,
  formatArabicDate,
  showToast,
  debounce,
  ARABIC_MONTHS,
  getMonthGrid,
  buildHeatmapWeeks,
  getRotatedDayNames,
  WEEK_START_OPTIONS,
  escapeHtml,
} from './utils.js';
import {
  renderCompass,
  renderDayStones,
  renderTaskCard,
  renderGoalManagerRow,
  renderLevelBar,
  renderStreakAndCoins,
  renderAchievementCard,
  renderAchievementPopup,
  renderCalendarGrid,
  renderHeatmap,
  renderSearchResult,
  renderStatGrid,
  renderReportCard,
  renderGoalYearProgress,
  renderTemplateCard,
  renderAccountRow,
  renderAccountDropdownList,
} from './components.js';
import { renderWeeklyPointsChart, renderTrendChart } from './charts.js';
import { computeGlobalStats, closeFinishedWeeks, countFullWeeks, countFullMonths } from './gamification.js';
import { ACHIEVEMENTS, checkNewlyUnlocked } from './achievements.js';
import { buildWeekReport, buildMonthReport, buildQuarterReport, buildYearReport } from './reports.js';
import { buildExportPayload, downloadJSON, readImportFile, saveAutoBackup, getAutoBackupInfo } from './backup.js';
import { initNavigation, openTab, closeTab, openProfile, closeProfile, getActiveTab } from './navigation.js';
import { rememberCurrentSession, getOtherAccounts, forgetAccount, switchToAccount } from './accounts.js';
import { hideSplash, showSplash, showLoadError } from './splash.js';
import { runOnboardingWizard } from './onboarding.js';

// ============================================================
// حالة التطبيق (State)
// ============================================================
const today = new Date();
const state = {
  user: null,
  goals: [],
  tasksByDate: {}, // { '2026-07-05': { goalId: taskRow } }
  restDays: new Set(),
  weekStartDay: 6, // 6=سبت (افتراضي)، بيتحدث من إعدادات المستخدم بعد التحميل
  weekDates: getWeekDates(),
  selectedDate: toISODate(new Date()),
  weekNotes: null,
  allWeekNotes: [], // كل ملاحظات الأسابيع (مطلوبة للبحث)
  userStats: { xp: 0, coins: 0, best_streak: 0, week_history: [], start_date: null, week_start_day: 6, onboarding_completed: false },
  unlockedAchievementIds: new Set(),
  computedStats: null, // آخر نتيجة من computeGlobalStats + مشتقات إضافية
  calendarYear: today.getFullYear(),
  calendarMonth: today.getMonth(), // 0-11
  heatmapYear: today.getFullYear(),
  modalDate: null, // التاريخ المفتوح حاليًا في نافذة تفاصيل اليوم
  reportTab: 'week',
  reportWeek: getWeekDates(today)[0],
  reportMonth: { year: today.getFullYear(), month: today.getMonth() },
  reportQuarter: { year: today.getFullYear(), quarter: Math.floor(today.getMonth() / 3) },
  reportYear: today.getFullYear(),
  templates: [],
};

const el = (id) => document.getElementById(id);

// ============================================================
// نقطة الدخول
// ============================================================
const INIT_TIMEOUT_MS = 7000; // لو التهيئة أخدت أكتر من كده، نعتبرها فشلت ونعرض زرار إعادة المحاولة

async function init() {
  showSplash();
  applySavedTheme();
  bindAuthForms();
  bindStaticEvents();

  // أي تغيير في حالة تسجيل الدخول بعد التحميل الأولي (دخول/خروج/تبديل حساب) — بنغلفه بـ try/catch/finally
  // عشان لو حصل أي Exception أثناء تحميل بيانات المستخدم، الشاشة متفضلش عالقة على Loading
  Auth.onAuthStateChange(async (user) => {
    state.user = user;
    try {
      if (user) {
        el('auth-screen').classList.add('hidden');
        el('app-shell').classList.remove('hidden');
        initNavigation(user.id);
        await rememberCurrentSession(supabaseClient, user);
        await loadEverything();
      } else {
        el('app-shell').classList.add('hidden');
        el('auth-screen').classList.remove('hidden');
      }
    } catch (err) {
      console.error('فشل تحديث حالة الجلسة', err);
      showToast('حصلت مشكلة أثناء تحميل بياناتك، جرّب تعمل Refresh للصفحة', 'error');
    } finally {
      hideSplash();
    }
  });

  // التهيئة الأولى (أول ما الصفحة تفتح): بنسباق بينها وبين Timeout احتياطي
  try {
    await Promise.race([runInitialAuthCheck(), rejectAfter(INIT_TIMEOUT_MS)]);
  } catch (err) {
    console.error('فشلت تهيئة التطبيق أو استغرقت وقتًا أطول من اللازم', err);
    hideSplash();
    showLoadError('تعذر تحميل التطبيق، حاول إعادة المحاولة');
  }
}

/** فحص حالة تسجيل الدخول الأولى وتحميل البيانات (منفصلة عشان تتسابق مع Timeout بسهولة) */
async function runInitialAuthCheck() {
  const existingUser = await Auth.getCurrentUser();
  state.user = existingUser;
  if (existingUser) {
    el('auth-screen').classList.add('hidden');
    el('app-shell').classList.remove('hidden');
    initNavigation(existingUser.id);
    await rememberCurrentSession(supabaseClient, existingUser);
    await loadEverything();
  } else {
    el('auth-screen').classList.remove('hidden');
    hideSplash();
  }
}

/** Promise بترفض بعد مدة معينة — أساس الـ Timeout الاحتياطي */
function rejectAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('init-timeout')), ms));
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
    await checkAndUnlockAchievements();
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
    await checkAndUnlockAchievements();
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

  el('btn-cal-prev').addEventListener('click', () => changeCalendarMonth(-1));
  el('btn-cal-next').addEventListener('click', () => changeCalendarMonth(1));
  el('btn-heatmap-prev').addEventListener('click', () => changeHeatmapYear(-1));
  el('btn-heatmap-next').addEventListener('click', () => changeHeatmapYear(1));

  el('search-input').addEventListener('input', debounce(performSearch, 300));
  el('search-goal-filter').addEventListener('change', performSearch);

  document.querySelectorAll('.js-report-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchReportTab(btn.dataset.tab));
  });
  el('btn-report-prev').addEventListener('click', () => navigateReport(-1));
  el('btn-report-next').addEventListener('click', () => navigateReport(1));

  el('btn-share-template').addEventListener('click', shareCurrentGoalsAsTemplate);

  el('btn-export').addEventListener('click', handleExport);
  el('btn-restore-backup').addEventListener('click', handleRestoreAutoBackup);
  el('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  });

  // ============================================================
  // نظام التنقل: القائمة الجانبية + شريط الـ Tabs + صفحة حسابي
  // ============================================================
  el('nav-list').addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item[data-page]');
    if (navItem) {
      openTab(navItem.dataset.page);
      renderPageContent(navItem.dataset.page);
    }
  });

  el('nav-profile').addEventListener('click', () => {
    openProfile();
    renderProfilePage();
  });

  el('btn-profile-back').addEventListener('click', () => closeProfile());

  // تفويض أحداث شريط الـ Tabs (فتح/تبديل/إغلاق)
  el('tab-bar').addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      closeTab(closeBtn.dataset.close);
      // بعد قفل Tab، navigation.js بيحول تلقائيًا لآخر Tab كان مفتوح (أو الرئيسية) — لازم نرندره
      renderPageContent(getActiveTab());
      return;
    }
    const tabBtn = e.target.closest('[data-tab-open]');
    if (tabBtn) {
      openTab(tabBtn.dataset.tabOpen);
      renderPageContent(tabBtn.dataset.tabOpen);
    }
  });

  el('btn-profile-logout').addEventListener('click', async () => {
    await Auth.signOut();
  });

  el('btn-add-account').addEventListener('click', async () => {
    await Auth.signOut();
    switchAuthTab('login');
    showToast('حسابك اتحفظ، تقدر تبدّل له تاني من صفحة حسابي بعد ما تسجّل دخول', 'success');
  });

  el('known-accounts-list').addEventListener('click', async (e) => {
    const switchBtn = e.target.closest('.js-switch-account');
    const forgetBtn = e.target.closest('.js-forget-account');

    if (switchBtn) {
      switchBtn.textContent = '...جاري التبديل';
      await performAccountSwitch(switchBtn.dataset.userId);
    }

    if (forgetBtn) {
      const userId = forgetBtn.dataset.userId;
      if (!confirm('هل تريد إزالة هذا الحساب من القائمة المحفوظة على هذا الجهاز؟')) return;
      forgetAccount(userId);
      renderKnownAccounts();
      renderAccountDropdown();
    }
  });

  // ============================================================
  // القائمة المنسدلة السريعة (▼ بجانب صورة الحساب)
  // ============================================================
  el('btn-account-switcher-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    el('account-dropdown').classList.toggle('account-dropdown--open');
  });

  document.addEventListener('click', (e) => {
    const dropdown = el('account-dropdown');
    if (!dropdown.classList.contains('account-dropdown--open')) return;
    if (!dropdown.contains(e.target) && e.target !== el('btn-account-switcher-toggle')) {
      dropdown.classList.remove('account-dropdown--open');
    }
  });

  el('account-dropdown-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-dropdown-switch');
    if (!btn) return;
    await performAccountSwitch(btn.dataset.userId);
  });

  el('btn-dropdown-add-account').addEventListener('click', async () => {
    el('account-dropdown').classList.remove('account-dropdown--open');
    await Auth.signOut();
    switchAuthTab('login');
    showToast('حسابك اتحفظ، تقدر تبدّل له تاني من صفحة حسابي بعد ما تسجّل دخول', 'success');
  });

  el('btn-dropdown-logout').addEventListener('click', async () => {
    await Auth.signOut();
  });

  // ============================================================
  // إعداد يوم بداية الأسبوع
  // ============================================================
  el('settings-week-start-options').addEventListener('change', (e) => {
    if (e.target.name === 'settings-week-start') {
      handleWeekStartChange(Number(e.target.value));
    }
  });

  el('btn-change-name').addEventListener('click', async () => {
    const newName = prompt('اكتب اسمك الجديد:', state.user.user_metadata?.full_name || '');
    if (!newName || !newName.trim()) return;
    try {
      await Auth.updateName(newName.trim());
      await DB.upsertRow('profiles', { id: state.user.id, full_name: newName.trim() });
      state.user.user_metadata = { ...state.user.user_metadata, full_name: newName.trim() };
      renderProfilePage();
      showToast('تم تحديث الاسم', 'success');
    } catch (err) {
      showToast(err.message || 'تعذر تحديث الاسم', 'error');
    }
  });

  el('btn-change-email').addEventListener('click', async () => {
    const newEmail = prompt('اكتب بريدك الإلكتروني الجديد:', state.user.email || '');
    if (!newEmail || !newEmail.trim()) return;
    try {
      await Auth.updateEmail(newEmail.trim());
      showToast('اتبعتلك رسالة تأكيد على بريدك الجديد، افتحها عشان التغيير يتفعّل', 'success');
    } catch (err) {
      showToast(err.message || 'تعذر تحديث البريد الإلكتروني', 'error');
    }
  });

  el('btn-change-password').addEventListener('click', async () => {
    const newPassword = prompt('اكتب كلمة المرور الجديدة (6 أحرف على الأقل):');
    if (!newPassword || newPassword.length < 6) {
      if (newPassword) showToast('كلمة المرور لازم تكون 6 أحرف على الأقل', 'error');
      return;
    }
    try {
      await Auth.updatePassword(newPassword);
      showToast('تم تغيير كلمة المرور', 'success');
    } catch (err) {
      showToast(err.message || 'تعذر تغيير كلمة المرور', 'error');
    }
  });
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
  try {
    const [goals, tasks, restDays, weekNotes, userStatsRows, userAchievements, templates] = await Promise.all([
      DB.fetchTable('goals', (g) => g.user_id === state.user.id),
      DB.fetchTable('tasks', (t) => t.user_id === state.user.id),
      DB.fetchTable('rest_days', (r) => r.user_id === state.user.id),
      DB.fetchTable('week_notes', (w) => w.user_id === state.user.id),
      DB.fetchTable('user_stats', (s) => s.user_id === state.user.id),
      DB.fetchTable('user_achievements', (a) => a.user_id === state.user.id),
      DB.fetchTable('templates'),
    ]);

    state.goals = goals.sort((a, b) => a.sort_order - b.sort_order);
    state.restDays = new Set(restDays.map((r) => r.rest_date));
    state.templates = templates.sort((a, b) => (b.uses_count || 0) - (a.uses_count || 0));

    state.tasksByDate = {};
    tasks.forEach((t) => {
      if (!state.tasksByDate[t.task_date]) state.tasksByDate[t.task_date] = {};
      state.tasksByDate[t.task_date][t.goal_id] = t;
    });

    state.userStats = userStatsRows[0] || {
      user_id: state.user.id,
      xp: 0,
      coins: 0,
      best_streak: 0,
      week_history: [],
      start_date: null,
      week_start_day: 6,
      onboarding_completed: false,
    };

    // يوم بداية الأسبوع من إعدادات المستخدم — بيتحكم في كل حسابات الأسبوع/التقويم/الـ Heatmap
    state.weekStartDay = state.userStats.week_start_day ?? 6;
    state.weekDates = getWeekDates(new Date(), state.weekStartDay);
    state.reportWeek = state.weekDates[0];

    const currentWeekStart = state.weekDates[0];
    state.allWeekNotes = weekNotes;
    state.weekNotes = weekNotes.find((w) => w.week_start === currentWeekStart) || null;
    state.unlockedAchievementIds = new Set(userAchievements.map((a) => a.achievement_id));

    // أول دخول: لسه محددش تاريخ بداية رحلته → اعرض معالج الإعداد قبل أي حاجة تانية
    if (!state.userStats.start_date) {
      runOnboardingWizard({ onComplete: handleOnboardingComplete });
      return;
    }

    await closePastWeeksAndAwardCoins();
    renderAll();
    await checkAndUnlockAchievements();
    saveAutoBackup(state.user.id, state);
    renderBackupInfo();
  } catch (err) {
    console.error('فشل تحميل بيانات التطبيق', err);
    showToast('تعذر تحميل بياناتك، تحقق من اتصالك بالإنترنت وحاول تاني', 'error');
  } finally {
    // مهما حصل (نجاح، فشل، أو حتى فتح معالج الإعداد) — شاشة التحميل لازم تختفي هنا
    hideSplash();
  }
}

/** بيتنفّذ لما المستخدم يخلّص معالج الإعداد الأول */
async function handleOnboardingComplete({ startDate, weekStartDay, goals }) {
  state.userStats = {
    ...state.userStats,
    user_id: state.user.id,
    start_date: startDate,
    week_start_day: weekStartDay,
    onboarding_completed: true,
  };
  await DB.upsertRow('user_stats', state.userStats);

  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const goalRow = {
      id: generateId(),
      user_id: state.user.id,
      name: g.name,
      points: g.points,
      color: ['#2DD4BF', '#F5B942', '#FF6B5C', '#7C9CFF', '#B98CF0', '#4ADE80'][i % 6],
      is_active: true,
      sort_order: i,
    };
    state.goals.push(goalRow);
    await DB.upsertRow('goals', goalRow);
  }

  showToast('رحلتك بدأت 🚀', 'success');
  await loadEverything();
}

/** يقفل أي أسبوع خلص ولسه مش متسجل، ويحسب Coins ويحدّث best_streak */
async function closePastWeeksAndAwardCoins() {
  const todayISO = toISODate(new Date());
  const allKnownWeekStarts = new Set();
  Object.keys(state.tasksByDate).forEach((date) => {
    allKnownWeekStarts.add(getWeekDates(new Date(date), state.weekStartDay)[0]);
  });

  const { updatedHistory, coinsGained } = closeFinishedWeeks({
    weekHistory: state.userStats.week_history || [],
    tasksByDate: state.tasksByDate,
    goals: state.goals,
    restDays: state.restDays,
    allKnownWeekStarts,
    todayISO,
  });

  const stats = computeGlobalStats({
    tasksByDate: state.tasksByDate,
    goals: state.goals,
    restDays: state.restDays,
    todayISO,
    bestStreakSaved: state.userStats.best_streak || 0,
  });

  const needsSave = coinsGained > 0 || stats.bestStreak > (state.userStats.best_streak || 0) || stats.totalPointsEarned !== state.userStats.xp;

  state.userStats = {
    ...state.userStats,
    xp: stats.totalPointsEarned,
    coins: (state.userStats.coins || 0) + coinsGained,
    best_streak: Math.max(stats.bestStreak, state.userStats.best_streak || 0),
    week_history: updatedHistory,
  };

  if (needsSave) {
    await DB.upsertRow('user_stats', state.userStats);
    if (coinsGained > 0) showToast(`أسبوع اتقفل! كسبت ${coinsGained} عملة 🪙`, 'success');
  }

  state.computedStats = stats;
}

/** فحص الإنجازات الجديدة وعرضها واحدة تلو الأخرى بـ Animation */
async function checkAndUnlockAchievements() {
  const fullStats = {
    ...state.computedStats,
    coins: state.userStats.coins || 0,
    fullWeeks: countFullWeeks(state.userStats.week_history || []),
    fullMonths: countFullMonths(state.userStats.week_history || []),
    goalsCount: state.goals.length,
    restDaysCount: state.restDays.size,
    level: state.computedStats.levelInfo.level,
  };

  const newly = checkNewlyUnlocked(fullStats, state.unlockedAchievementIds);
  for (const achievement of newly) {
    state.unlockedAchievementIds.add(achievement.id);
    await DB.upsertRow('user_achievements', {
      id: generateId(),
      user_id: state.user.id,
      achievement_id: achievement.id,
    });
    await showAchievementPopup(achievement);
  }
  if (newly.length > 0 && getActiveTab() === 'achievements') renderAchievementsGrid();
}

function showAchievementPopup(achievement) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'achievement-overlay';
    overlay.innerHTML = `<div class="achievement-popup">${renderAchievementPopup(achievement)}</div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('achievement-overlay--visible'));
    setTimeout(() => {
      overlay.classList.remove('achievement-overlay--visible');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 350);
    }, 2600);
  });
}

// ============================================================
// التعامل مع تغييرات بطاقات المهام
// ============================================================
async function handleTaskFieldChange(e) {
  const goalId = e.target.dataset.goalId;
  if (!goalId) return;
  const dateContainer = e.target.closest('[data-tasks-date]');
  const date = dateContainer ? dateContainer.dataset.tasksDate : state.selectedDate;
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
    const inModal = dateContainer && dateContainer.id === 'day-modal-tasks';
    if (inModal) refreshModalTasks(date);
    renderAll();
    if (task.is_completed) celebrateTaskDone(goalId, inModal ? 'day-modal-tasks' : 'tasks-container');
    await checkAndUnlockAchievements();
  } else {
    recomputeStats();
    if (getActiveTab() === 'home') renderHero(); // تحديث الأرقام فقط بدون إعادة رسم كل البطاقات
  }
}

/** تحديث بطاقات المهام داخل مودال تفاصيل اليوم بعد أي تعديل */
function refreshModalTasks(date) {
  const container = document.getElementById('day-modal-tasks');
  if (!container) return;
  const activeGoals = state.goals.filter((g) => g.is_active);
  const dayTasks = state.tasksByDate[date] || {};
  container.innerHTML = activeGoals.map((g) => renderTaskCard(g, dayTasks[g.id])).join('');
}

/** يشغّل Animation النبضة على البطاقة اللي المستخدم فعلًا ضغط عليها بس (بدل أول بطاقة مكتملة في الصفحة) */
function celebrateTaskDone(goalId, containerId = 'tasks-container') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const card = container.querySelector(`.task-card[data-goal-id="${goalId}"]`);
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
  recomputeStats();
  if (getActiveTab() === 'home') renderHero();
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
  state.allWeekNotes = [...state.allWeekNotes.filter((w) => w.week_start !== weekStart), notes];
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
// ============================================================
// الرندر الكسول (Lazy Rendering): كل Tab بيترندر بس لما يكون هو المفتوح
// state.computedStats بيتحدث دايمًا (رخيص نسبيًا ومطلوب للإنجازات)،
// لكن بناء الـ DOM الفعلي (تقارير/تقويم/Heatmap...) بيحصل بس للـ Tab النشط
// ============================================================

/** إعادة حساب كل الإحصائيات العامة (XP/المستوى/الـ Streak) — لازم تفضل شغالة دايمًا مهما كان الـ Tab المفتوح */
function recomputeStats() {
  state.computedStats = computeGlobalStats({
    tasksByDate: state.tasksByDate,
    goals: state.goals,
    restDays: state.restDays,
    todayISO: toISODate(new Date()),
    bestStreakSaved: state.userStats.best_streak || 0,
  });
  state.userStats.xp = state.computedStats.totalPointsEarned;
  state.userStats.best_streak = Math.max(state.computedStats.bestStreak, state.userStats.best_streak || 0);
}

/** رندر كل عناصر صفحة الرئيسية */
function renderHomePage() {
  renderHero();
  renderGoalsManager();
  renderTasksForSelectedDay();
  renderWeekNotesFields();
  renderSearchFilterOptions();
}

/** رندر كل عناصر صفحة التقويم */
function renderCalendarPage() {
  renderCalendar();
  renderHeatmapSection();
}

/** رندر كل عناصر صفحة الإحصائيات */
function renderStatsPage() {
  renderReports();
  renderComparison();
  renderYearGoalsProgress();
}

/** رندر صفحة معيّنة بالاسم (مستخدمة عند فتح/تبديل Tab) */
function renderPageContent(pageId) {
  if (pageId === 'home') renderHomePage();
  else if (pageId === 'calendar') renderCalendarPage();
  else if (pageId === 'stats') renderStatsPage();
  else if (pageId === 'achievements') renderAchievementsGrid();
  else if (pageId === 'explore') renderExplore();
}

/**
 * نقطة الدخول الرئيسية بعد أي تغيير في البيانات.
 * بدل ما ترندر كل الـ Tabs السبعة، بترندر بس الإحصائيات العامة + الـ Tab المفتوح فعلًا.
 * باقي الـ Tabs هترندر لوحدها أول ما المستخدم يفتحها (شوف renderPageContent في bindStaticEvents).
 */
function renderAll() {
  recomputeStats();
  renderPageContent(getActiveTab());
}

function renderHero() {
  const totals = computeWeekTotals();
  el('compass-container').innerHTML = renderCompass(totals.percentage, totals.pointsEarned, totals.pointsTotal);
  el('level-bar-container').innerHTML = renderLevelBar(state.computedStats.levelInfo);
  el('streak-coins-container').innerHTML = renderStreakAndCoins(
    state.computedStats.currentStreak,
    state.userStats.best_streak,
    state.userStats.coins || 0
  );

  const completionMap = {};
  state.weekDates.forEach((d) => {
    completionMap[d] = computeDayCompletion(d);
  });
  el('day-path-container').innerHTML = renderDayStones(
    state.weekDates,
    completionMap,
    state.restDays,
    state.selectedDate,
    getRotatedDayNames(state.weekStartDay)
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
  el('tasks-container').setAttribute('data-tasks-date', state.selectedDate);
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

function renderAchievementsGrid() {
  const container = el('achievements-grid');
  if (!container) return;
  container.innerHTML = ACHIEVEMENTS.map((a) =>
    renderAchievementCard(a, state.unlockedAchievementIds.has(a.id))
  ).join('');
  el('achievements-count').textContent = `${state.unlockedAchievementIds.size} / ${ACHIEVEMENTS.length}`;
}

// ============================================================
// التقويم التفاعلي (Calendar View)
// ============================================================
/** نفس حساب نسبة اليوم، لكن يرجّع null للأيام المستقبلية عشان مايتلوّنوش كأنها "فايتة" */
function dayCompletionForDisplay(date) {
  const todayISO = toISODate(new Date());
  if (date > todayISO) return null;
  return computeDayCompletion(date);
}

function renderCalendar() {
  const cells = getMonthGrid(state.calendarYear, state.calendarMonth, state.weekStartDay);
  el('calendar-container').innerHTML = renderCalendarGrid(cells, dayCompletionForDisplay, state.restDays, toISODate(new Date()), getRotatedDayNames(state.weekStartDay));
  el('calendar-label').textContent = `${ARABIC_MONTHS[state.calendarMonth]} ${state.calendarYear}`;
  document.querySelectorAll('.cal-cell[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => openDayModal(btn.dataset.date));
  });
}

function changeCalendarMonth(delta) {
  let m = state.calendarMonth + delta;
  let y = state.calendarYear;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  state.calendarMonth = m;
  state.calendarYear = y;
  renderCalendar();
}

/** مودال تفاصيل اليوم — يُستخدم عند الضغط على أي يوم في التقويم */
function openDayModal(date) {
  state.modalDate = date;
  const activeGoals = state.goals.filter((g) => g.is_active);
  const dayTasks = state.tasksByDate[date] || {};
  const isRest = state.restDays.has(date);

  const overlay = document.createElement('div');
  overlay.className = 'day-modal-overlay';
  overlay.id = 'day-modal-overlay';
  overlay.innerHTML = `
    <div class="day-modal">
      <div class="day-modal__header">
        <h3>${formatArabicDate(date)}</h3>
        <button class="icon-btn" id="btn-close-day-modal">✕</button>
      </div>
      ${isRest ? '<p class="rest-day-banner">🌿 هذا يوم راحة</p>' : ''}
      <div id="day-modal-tasks" data-tasks-date="${date}">
        ${activeGoals.length === 0 ? emptyState('لا توجد أهداف بعد') : activeGoals.map((g) => renderTaskCard(g, dayTasks[g.id])).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('day-modal-overlay--visible'));

  el('btn-close-day-modal').addEventListener('click', closeDayModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDayModal(); });

  const tasksEl = document.getElementById('day-modal-tasks');
  tasksEl.addEventListener('change', handleTaskFieldChange);
  tasksEl.addEventListener(
    'input',
    debounce((e) => {
      if (e.target.classList.contains('js-task-notes')) handleTaskFieldChange(e);
    }, 500)
  );
}

function closeDayModal() {
  const overlay = document.getElementById('day-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('day-modal-overlay--visible');
  setTimeout(() => overlay.remove(), 250);
  state.modalDate = null;
}

// ============================================================
// Heatmap السنوي
// ============================================================
function renderHeatmapSection() {
  const weeks = buildHeatmapWeeks(state.heatmapYear, state.weekStartDay);
  el('heatmap-container').innerHTML = renderHeatmap(weeks, state.heatmapYear, dayCompletionForDisplay, state.restDays);
  el('heatmap-year-label').textContent = String(state.heatmapYear);
}

function changeHeatmapYear(delta) {
  state.heatmapYear += delta;
  renderHeatmapSection();
}

// ============================================================
// البحث والفلاتر
// ============================================================
function renderSearchFilterOptions() {
  const select = el('search-goal-filter');
  const current = select.value;
  select.innerHTML =
    '<option value="">كل الأهداف</option>' +
    state.goals.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  if (state.goals.some((g) => g.id === current)) select.value = current;
}

function performSearch() {
  const query = el('search-input').value.trim().toLowerCase();
  const goalFilter = el('search-goal-filter').value;
  if (!query) {
    el('search-results').innerHTML = emptyState('اكتب كلمة للبحث داخل الأهداف والملاحظات والأسابيع');
    return;
  }

  const results = [];

  state.goals.forEach((g) => {
    if (goalFilter && g.id !== goalFilter) return;
    if (g.name.toLowerCase().includes(query)) {
      results.push({ type: 'goal', title: g.name, snippet: `${g.points} نقطة لكل إنجاز`, date: null });
    }
  });

  Object.entries(state.tasksByDate).forEach(([date, dayTasks]) => {
    Object.values(dayTasks).forEach((task) => {
      if (goalFilter && task.goal_id !== goalFilter) return;
      if (task.notes && task.notes.toLowerCase().includes(query)) {
        const goal = state.goals.find((g) => g.id === task.goal_id);
        results.push({ type: 'task', title: goal?.name || 'مهمة', snippet: task.notes.slice(0, 90), date });
      }
    });
  });

  if (!goalFilter) {
    state.allWeekNotes.forEach((w) => {
      const combined = [w.best_thing, w.worst_thing, w.biggest_challenge, w.next_improvement, w.general_notes]
        .filter(Boolean)
        .join(' — ');
      if (combined.toLowerCase().includes(query)) {
        results.push({
          type: 'week_note',
          title: `ملاحظات أسبوع ${formatArabicDate(w.week_start)}`,
          snippet: combined.slice(0, 90),
          date: w.week_start,
        });
      }
    });
  }

  el('search-results').innerHTML = results.length ? results.map(renderSearchResult).join('') : emptyState('لا توجد نتائج مطابقة');
  document.querySelectorAll('.search-result').forEach((btn) => {
    const date = btn.dataset.date;
    if (date) btn.addEventListener('click', () => openDayModal(date));
  });
}

// ============================================================
// التقارير التلقائية (أسبوعي / شهري / ربع سنوي / سنوي)
// ============================================================
function switchReportTab(tab) {
  state.reportTab = tab;
  document.querySelectorAll('.js-report-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  renderReports();
}

function navigateReport(delta) {
  if (state.reportTab === 'week') {
    state.reportWeek = addDaysLocal(state.reportWeek, delta * 7);
  } else if (state.reportTab === 'month') {
    let m = state.reportMonth.month + delta;
    let y = state.reportMonth.year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    state.reportMonth = { year: y, month: m };
  } else if (state.reportTab === 'quarter') {
    let q = state.reportQuarter.quarter + delta;
    let y = state.reportQuarter.year;
    if (q < 0) { q = 3; y -= 1; }
    if (q > 3) { q = 0; y += 1; }
    state.reportQuarter = { year: y, quarter: q };
  } else {
    state.reportYear += delta;
  }
  renderReports();
}

function addDaysLocal(iso, delta) {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function renderReports() {
  const goals = state.goals.filter((g) => g.is_active);
  let report;
  let label;
  let chartLabels = [];
  let chartData = [];

  if (state.reportTab === 'week') {
    report = buildWeekReport(state.reportWeek, goals, state.tasksByDate, state.restDays);
    label = `${formatArabicDate(state.reportWeek)} — ${formatArabicDate(addDaysLocal(state.reportWeek, 6))}`;
    chartLabels = getRotatedDayNames(state.weekStartDay);
    chartData = state.weekDates.map((_, i) => {
      const date = addDaysLocal(state.reportWeek, i);
      const p = report.dayPercentages[date];
      return p === null || p === undefined ? 0 : p;
    });
  } else if (state.reportTab === 'month') {
    report = buildMonthReport(state.reportMonth.year, state.reportMonth.month, goals, state.tasksByDate, state.restDays, state.weekStartDay);
    label = report.label;
    chartLabels = report.weeks.map((w, i) => `أسبوع ${i + 1}`);
    chartData = report.weeks.map((w) => w.percentage);
  } else if (state.reportTab === 'quarter') {
    report = buildQuarterReport(state.reportQuarter.year, state.reportQuarter.quarter, goals, state.tasksByDate, state.restDays);
    label = report.label;
    chartLabels = report.monthStats.map((m) => m.label);
    chartData = report.monthStats.map((m) => m.percentage);
  } else {
    report = buildYearReport(state.reportYear, goals, state.tasksByDate, state.restDays);
    label = report.label;
    chartLabels = report.monthStats.map((m) => m.label);
    chartData = report.monthStats.map((m) => m.percentage);
  }

  el('report-period-label').textContent = label;
  el('report-content').innerHTML = renderReportCard(report, formatArabicDate);
  renderTrendChart('report-trend-chart', chartLabels, chartData);
}

// ============================================================
// مقارنة الأداء
// ============================================================
function renderComparison() {
  const goals = state.goals.filter((g) => g.is_active);
  const thisWeek = buildWeekReport(getWeekDates(new Date(), state.weekStartDay)[0], goals, state.tasksByDate, state.restDays);
  const lastWeek = buildWeekReport(addDaysLocal(getWeekDates(new Date(), state.weekStartDay)[0], -7), goals, state.tasksByDate, state.restDays);
  const thisMonth = buildMonthReport(new Date().getFullYear(), new Date().getMonth(), goals, state.tasksByDate, state.restDays, state.weekStartDay);
  const thisYear = buildYearReport(new Date().getFullYear(), goals, state.tasksByDate, state.restDays);

  const rows = [
    { label: 'هذا الأسبوع مقابل الأسبوع الماضي', current: thisWeek.percentage, previous: lastWeek.percentage },
    { label: 'هذا الشهر مقابل الشهر الماضي', current: thisMonth.percentage, previous: thisMonth.previousPercentage },
    { label: 'هذه السنة مقابل السنة الماضية', current: thisYear.percentage, previous: thisYear.previousPercentage },
  ];

  el('comparison-container').innerHTML = rows
    .map((r) => {
      const diff = r.current - r.previous;
      const isUp = diff >= 0;
      return `
        <div class="compare-row">
          <span class="compare-row__label">${r.label}</span>
          <span class="compare-row__values">${r.previous}% → ${r.current}%</span>
          <span class="compare-row__diff ${isUp ? 'compare-row__diff--up' : 'compare-row__diff--down'}">
            ${isUp ? '▲' : '▼'} ${Math.abs(diff)}%
          </span>
        </div>
      `;
    })
    .join('');
}

// ============================================================
// تقدم الأهداف خلال السنة
// ============================================================
function renderYearGoalsProgress() {
  const goals = state.goals.filter((g) => g.is_active);
  const year = new Date().getFullYear();
  const report = buildYearReport(year, goals, state.tasksByDate, state.restDays);
  el('year-goals-container').innerHTML = renderGoalYearProgress(report.goalsYearProgress);
}

// ============================================================
// صفحة Explore (مشاركة القوالب)
// ============================================================
function renderExplore() {
  const container = el('explore-list');
  if (!state.templates.length) {
    container.innerHTML = emptyState('لا توجد قوالب منشورة بعد، كن أول من يشارك قالبًا!');
    return;
  }
  container.innerHTML = state.templates
    .map((t) => renderTemplateCard(t, t.user_id === state.user.id))
    .join('');

  document.querySelectorAll('.js-copy-template').forEach((btn) => {
    btn.addEventListener('click', () => copyTemplateToMyAccount(btn.dataset.templateId));
  });
}

async function shareCurrentGoalsAsTemplate() {
  const title = el('template-title').value.trim();
  const description = el('template-description').value.trim();
  const activeGoals = state.goals.filter((g) => g.is_active);
  if (!title) return showToast('اكتب اسم للقالب أولًا', 'error');
  if (activeGoals.length === 0) return showToast('أضف أهداف أولًا عشان تقدر تشاركها', 'error');

  const template = {
    id: generateId(),
    user_id: state.user.id,
    title,
    description,
    goals: activeGoals.map((g) => ({ name: g.name, points: g.points })),
    uses_count: 0,
  };
  await DB.upsertRow('templates', template);
  state.templates.unshift(template);
  el('template-title').value = '';
  el('template-description').value = '';
  renderExplore();
  showToast('تمت مشاركة القالب في Explore 🌍', 'success');
}

async function copyTemplateToMyAccount(templateId) {
  const template = state.templates.find((t) => t.id === templateId);
  if (!template) return;

  const newGoals = (template.goals || []).map((g, i) => ({
    id: generateId(),
    user_id: state.user.id,
    name: g.name,
    points: g.points || 10,
    color: ['#2DD4BF', '#F5B942', '#FF6B5C', '#7C9CFF', '#B98CF0', '#4ADE80'][i % 6],
    is_active: true,
    sort_order: state.goals.length + i,
  }));

  for (const g of newGoals) {
    state.goals.push(g);
    await DB.upsertRow('goals', g);
  }

  try {
    await supabaseClient.rpc('increment_template_uses', { template_id: templateId });
    template.uses_count = (template.uses_count || 0) + 1;
  } catch (err) {
    console.warn('تعذر تحديث عداد الاستخدام', err);
  }

  renderAll();
  showToast(`تم نسخ ${newGoals.length} هدف لحسابك 🎯`, 'success');
}

// ============================================================
// النسخ الاحتياطي (Export / Import / Auto Backup)
// ============================================================
function renderBackupInfo() {
  const info = getAutoBackupInfo(state.user.id);
  el('auto-backup-info').textContent = info
    ? `آخر نسخة تلقائية: ${new Date(info.exportedAt).toLocaleString('ar-EG')}`
    : 'لا توجد نسخة تلقائية بعد';
}

function handleExport() {
  const payload = buildExportPayload(state);
  downloadJSON(payload, `goaltrack-backup-${toISODate(new Date())}.json`);
  showToast('تم تصدير بياناتك بنجاح', 'success');
}

async function handleImportFile(file) {
  try {
    const payload = await readImportFile(file);
    for (const g of payload.goals || []) {
      await DB.upsertRow('goals', { ...g, user_id: state.user.id });
    }
    for (const t of payload.tasks || []) {
      await DB.upsertRow('tasks', { ...t, user_id: state.user.id });
    }
    for (const d of payload.restDays || []) {
      await DB.upsertRow('rest_days', { id: `${state.user.id}-${d}`, user_id: state.user.id, rest_date: d, note: '' });
    }
    for (const w of payload.weekNotes || []) {
      await DB.upsertRow('week_notes', { ...w, user_id: state.user.id });
    }
    if (payload.userStats) {
      await DB.upsertRow('user_stats', { ...payload.userStats, user_id: state.user.id });
    }
    for (const achievementId of payload.unlockedAchievements || []) {
      await DB.upsertRow('user_achievements', { id: generateId(), user_id: state.user.id, achievement_id: achievementId });
    }
    showToast('تم استيراد البيانات بنجاح، جاري إعادة التحميل...', 'success');
    await loadEverything();
  } catch (err) {
    showToast('تعذر استيراد الملف: ' + err.message, 'error');
  }
}

async function handleRestoreAutoBackup() {
  const info = getAutoBackupInfo(state.user.id);
  if (!info) return showToast('لا توجد نسخة تلقائية محفوظة', 'error');
  if (!confirm('هل تريد استعادة آخر نسخة احتياطية تلقائية؟ هيتم دمجها مع بياناتك الحالية.')) return;
  await handleImportFromPayload(info.payload);
}

async function handleImportFromPayload(payload) {
  for (const g of payload.goals || []) await DB.upsertRow('goals', { ...g, user_id: state.user.id });
  for (const t of payload.tasks || []) await DB.upsertRow('tasks', { ...t, user_id: state.user.id });
  for (const w of payload.weekNotes || []) await DB.upsertRow('week_notes', { ...w, user_id: state.user.id });
  if (payload.userStats) await DB.upsertRow('user_stats', { ...payload.userStats, user_id: state.user.id });
  showToast('تم استرجاع النسخة الاحتياطية', 'success');
  await loadEverything();
}

/** تبديل فعلي لحساب محفوظ (مُستخدمة من القائمة المنسدلة وقائمة إدارة الحسابات) */
async function performAccountSwitch(userId) {
  try {
    await switchToAccount(supabaseClient, userId);
    el('account-dropdown').classList.remove('account-dropdown--open');
    showToast('تم التبديل للحساب بنجاح', 'success');
    renderProfilePage();
  } catch (err) {
    showToast(err.message || 'تعذر التبديل لهذا الحساب', 'error');
    renderKnownAccounts();
    renderAccountDropdown();
  }
}

// ============================================================
// صفحة حسابي (Profile)
// ============================================================
function renderProfilePage() {
  const user = state.user;
  if (!user) return;

  const provider = user.app_metadata?.provider || 'email';
  const isGoogle = provider === 'google';
  const fullName = user.user_metadata?.full_name || 'بدون اسم';

  el('profile-avatar').textContent = fullName.trim().charAt(0).toUpperCase() || '؟';
  el('profile-name').textContent = fullName;
  el('profile-email').textContent = user.email || '—';
  el('profile-created').textContent = user.created_at ? formatArabicDate(user.created_at.slice(0, 10)) : '—';
  el('profile-last-login').textContent = user.last_sign_in_at ? formatArabicDate(user.last_sign_in_at.slice(0, 10)) : '—';

  recomputeStats();
  el('profile-level').textContent = `المستوى ${state.computedStats.levelInfo.level}`;

  el('profile-google-notice').classList.toggle('hidden', !isGoogle);
  el('btn-change-password').classList.toggle('hidden', isGoogle);
  el('btn-change-email').classList.toggle('hidden', isGoogle);

  renderKnownAccounts();
  renderAccountDropdown();
  renderWeekStartSetting();
}

/** رسم قائمة الحسابات المحفوظة على الجهاز (غير الحساب الحالي) للتبديل السريع */
function renderKnownAccounts() {
  const others = getOtherAccounts(state.user.id);
  el('known-accounts-list').innerHTML = others.length
    ? others.map(renderAccountRow).join('')
    : emptyState('مفيش حسابات تانية محفوظة على الجهاز ده. سجّل دخول بحساب تاني وهيتحفظ هنا تلقائيًا.');
}

/** رسم محتوى القائمة المنسدلة السريعة (▼ بجانب صورة الحساب) */
function renderAccountDropdown() {
  const others = getOtherAccounts(state.user.id);
  el('account-dropdown-list').innerHTML = renderAccountDropdownList(state.user, others);
}

/** رسم خيارات يوم بداية الأسبوع داخل إعدادات الحساب */
function renderWeekStartSetting() {
  el('settings-week-start-options').innerHTML = WEEK_START_OPTIONS.map(
    (opt) => `
      <label class="onboarding-radio">
        <input type="radio" name="settings-week-start" value="${opt.value}" ${Number(state.weekStartDay) === opt.value ? 'checked' : ''} />
        <span>${opt.label}</span>
      </label>`
  ).join('');
}

async function handleWeekStartChange(newValue) {
  state.weekStartDay = newValue;
  state.userStats.week_start_day = newValue;
  await DB.upsertRow('user_stats', state.userStats);
  state.weekDates = getWeekDates(new Date(), state.weekStartDay);
  state.reportWeek = state.weekDates[0];
  renderAll();
  showToast('اتغيّر يوم بداية الأسبوع', 'success');
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