import { toISODate, calcPercentage } from './utils.js';

// ============================================================
// نظام الألعاب (Gamification): المستويات، الـ Streak، العملات
// ============================================================

/** تكلفة الـ XP المطلوبة للانتقال من مستوى لآخر — كل مستوى أصعب من اللي قبله */
function xpCostForLevel(level) {
  return Math.round(100 * Math.pow(level, 1.35));
}

/** حساب المستوى الحالي وتفاصيل شريط الخبرة من إجمالي XP */
export function getLevelInfo(totalXP) {
  let level = 1;
  let remaining = totalXP;
  let cost = xpCostForLevel(level);

  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = xpCostForLevel(level);
  }

  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: cost,
    progressPercent: calcPercentage(remaining, cost),
  };
}

function addDays(isoDate, delta) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/**
 * حساب الـ Streak الحالي بالرجوع للخلف من أمس، مع تخطي أيام الراحة.
 * يوم "مكتمل" = كل الأهداف النشطة اتعملت فيه. يوم بدون أي بيانات = توقف السلسلة.
 */
export function calculateCurrentStreak({ tasksByDate, restDays, activeGoals, todayISO }) {
  if (activeGoals.length === 0) return 0;

  const dayCompletion = (date) => {
    const dayTasks = tasksByDate[date] || {};
    const done = activeGoals.filter((g) => dayTasks[g.id]?.is_completed).length;
    return calcPercentage(done, activeGoals.length);
  };

  let streak = 0;
  let cursor = addDays(todayISO, -1); // نبدأ من أمس

  // نرجع للخلف طالما الأيام مكتملة 100% (أو راحة فبنتخطاها من غير كسر)
  // نوقف بعد أقصى حد معقول (سنتين) لتجنب حلقة لا نهائية لو في بيانات غريبة
  for (let i = 0; i < 730; i++) {
    if (restDays.has(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    const dayTasks = tasksByDate[cursor];
    if (!dayTasks) break; // مفيش بيانات = توقفت السلسلة هنا
    if (dayCompletion(cursor) === 100) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  // لو النهاردة نفسه مكتمل بالكامل، يتحسب ضمن السلسلة كمان
  if (dayCompletion(todayISO) === 100) streak += 1;

  return streak;
}

/**
 * تجميع كل الإحصائيات المطلوبة لعرض المستوى/الإنجازات/العملات
 */
export function computeGlobalStats({ tasksByDate, goals, restDays, todayISO, bestStreakSaved }) {
  const activeGoals = goals.filter((g) => g.is_active);

  let totalTasksCompleted = 0;
  let totalPointsEarned = 0;

  Object.values(tasksByDate).forEach((dayTasks) => {
    Object.values(dayTasks).forEach((task) => {
      if (task.is_completed) {
        totalTasksCompleted += 1;
        totalPointsEarned += task.points_earned || 0;
      }
    });
  });

  const currentStreak = calculateCurrentStreak({ tasksByDate, restDays, activeGoals, todayISO });
  const bestStreak = Math.max(currentStreak, bestStreakSaved || 0);

  return {
    totalTasksCompleted,
    totalPointsEarned, // = XP
    currentStreak,
    bestStreak,
    goalsCount: goals.length,
    levelInfo: getLevelInfo(totalPointsEarned),
  };
}

/**
 * فحص الأسابيع اللي خلصت (تاريخ نهايتها فات) ولسه مش متقفلة، وقفلها:
 * - يحسب نسبة إنجاز الأسبوع ويضيفه لسجل week_history
 * - يمنح Coins حسب النسبة (كل 10% = عملة واحدة تقريبًا)
 * يرجع: { updatedHistory, coinsGained, newlyClosedWeeks }
 */
export function closeFinishedWeeks({ weekHistory, tasksByDate, goals, restDays, allKnownWeekStarts, todayISO }) {
  const activeGoals = goals.filter((g) => g.is_active);
  const closedStarts = new Set(weekHistory.map((w) => w.week_start));
  const updatedHistory = [...weekHistory];
  let coinsGained = 0;
  const newlyClosedWeeks = [];

  allKnownWeekStarts.forEach((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    if (weekEnd >= todayISO) return; // الأسبوع لسه ما خلصش
    if (closedStarts.has(weekStart)) return; // مقفول بالفعل

    let done = 0;
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      if (restDays.has(date)) continue;
      const dayTasks = tasksByDate[date] || {};
      activeGoals.forEach((goal) => {
        total += 1;
        if (dayTasks[goal.id]?.is_completed) done += 1;
      });
    }

    const percentage = total === 0 ? 0 : calcPercentage(done, total);
    const coins = Math.round(percentage / 10);
    coinsGained += coins;
    const entry = { week_start: weekStart, percentage, coins };
    updatedHistory.push(entry);
    newlyClosedWeeks.push(entry);
  });

  return { updatedHistory, coinsGained, newlyClosedWeeks };
}

/** عدد الأسابيع المثالية (100%) — يُستخدم لإنجاز "أول أسبوع كامل" */
export function countFullWeeks(weekHistory) {
  return weekHistory.filter((w) => w.percentage === 100).length;
}

/**
 * عدد الشهور "الكاملة": شهر تم فيه تسجيل 4 أسابيع أو أكثر وكلها 100%
 */
export function countFullMonths(weekHistory) {
  const byMonth = {};
  weekHistory.forEach((w) => {
    const month = w.week_start.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(w.percentage);
  });
  return Object.values(byMonth).filter((weeks) => weeks.length >= 4 && weeks.every((p) => p === 100)).length;
}
