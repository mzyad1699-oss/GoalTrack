import { toISODate, calcPercentage, calcGrade, addDays, ARABIC_MONTHS } from './utils.js';

// ============================================================
// وحدة التقارير: تجميع الإحصائيات لأي نطاق تاريخ (أسبوع/شهر/ربع/سنة)
// كل التقارير مبنية فوق نفس goals الحالية (تبسيط منطقي للـ MVP)
// ============================================================

/** إحصائيات كاملة لنطاق تاريخ معيّن (شامل الطرفين) */
export function getRangeStats(startDate, endDate, goals, tasksByDate, restDays) {
  const goalStats = {};
  goals.forEach((g) => { goalStats[g.id] = { id: g.id, name: g.name, done: 0, total: 0, points: 0 }; });

  let totalPossible = 0;
  let totalDone = 0;
  let pointsEarned = 0;
  let pointsTotal = 0;
  let restDaysCount = 0;
  const dayPercentages = {};

  let cursor = new Date(startDate);
  const last = new Date(endDate);
  while (cursor <= last) {
    const dateStr = toISODate(cursor);
    if (restDays.has(dateStr)) {
      restDaysCount += 1;
      dayPercentages[dateStr] = null;
    } else if (goals.length === 0) {
      dayPercentages[dateStr] = null;
    } else {
      const dayTasks = tasksByDate[dateStr] || {};
      let dayDone = 0;
      goals.forEach((g) => {
        totalPossible += 1;
        pointsTotal += g.points;
        goalStats[g.id].total += 1;
        if (dayTasks[g.id]?.is_completed) {
          dayDone += 1;
          totalDone += 1;
          pointsEarned += g.points;
          goalStats[g.id].points += g.points;
          goalStats[g.id].done += 1;
        }
      });
      dayPercentages[dateStr] = calcPercentage(dayDone, goals.length);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const dayEntries = Object.entries(dayPercentages).filter(([, p]) => p !== null);
  const bestDay = dayEntries.length ? dayEntries.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  const worstDay = dayEntries.length ? dayEntries.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;

  const goalEntries = Object.values(goalStats).map((s) => ({ ...s, rate: s.total ? (s.done / s.total) * 100 : 0 }));
  const bestGoal = goalEntries.length ? goalEntries.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worstGoal = goalEntries.length ? goalEntries.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;

  const percentage = calcPercentage(totalDone, totalPossible);

  return {
    startDate,
    endDate,
    percentage,
    grade: calcGrade(percentage),
    pointsEarned,
    pointsTotal,
    totalTasks: totalPossible,
    completedTasks: totalDone,
    restDaysCount,
    bestDay: bestDay ? { date: bestDay[0], percentage: bestDay[1] } : null,
    worstDay: worstDay ? { date: worstDay[0], percentage: worstDay[1] } : null,
    bestGoal,
    worstGoal,
    dayPercentages,
    goalStats: goalEntries,
  };
}

function diffLabel(current, previous) {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  return { diff, isImprovement: diff >= 0 };
}

/** تقرير أسبوعي كامل مع مقارنة بالأسبوع السابق */
export function buildWeekReport(weekStart, goals, tasksByDate, restDays) {
  const current = getRangeStats(weekStart, addDays(weekStart, 6), goals, tasksByDate, restDays);
  const prevStart = addDays(weekStart, -7);
  const previous = getRangeStats(prevStart, addDays(prevStart, 6), goals, tasksByDate, restDays);
  return { ...current, comparison: diffLabel(current.percentage, previous.percentage), previousPercentage: previous.percentage };
}

/** تقرير شهري كامل: متوسط، أفضل/أسوأ أسبوع، مقارنة بالشهر السابق */
export function buildMonthReport(year, monthIndex, goals, tasksByDate, restDays) {
  const monthStart = toISODate(new Date(year, monthIndex, 1));
  const monthEnd = toISODate(new Date(year, monthIndex + 1, 0));
  const current = getRangeStats(monthStart, monthEnd, goals, tasksByDate, restDays);

  // أفضل/أسوأ أسبوع داخل الشهر
  const weekStats = [];
  let cursor = new Date(monthStart);
  const lastCursor = new Date(monthEnd);
  const seenWeekStarts = new Set();
  while (cursor <= lastCursor) {
    const dateStr = toISODate(cursor);
    const jsDay = cursor.getDay();
    const weekStart = addDays(dateStr, -((jsDay + 1) % 7));
    if (!seenWeekStarts.has(weekStart)) {
      seenWeekStarts.add(weekStart);
      weekStats.push({ weekStart, ...getRangeStats(weekStart, addDays(weekStart, 6), goals, tasksByDate, restDays) });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const bestWeek = weekStats.length ? weekStats.reduce((a, b) => (b.percentage > a.percentage ? b : a)) : null;
  const worstWeek = weekStats.length ? weekStats.reduce((a, b) => (b.percentage < a.percentage ? b : a)) : null;

  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const prevStart = toISODate(new Date(prevYear, prevMonthIndex, 1));
  const prevEnd = toISODate(new Date(prevYear, prevMonthIndex + 1, 0));
  const previous = getRangeStats(prevStart, prevEnd, goals, tasksByDate, restDays);

  return {
    ...current,
    label: `${ARABIC_MONTHS[monthIndex]} ${year}`,
    weeks: weekStats,
    bestWeek,
    worstWeek,
    comparison: diffLabel(current.percentage, previous.percentage),
    previousPercentage: previous.percentage,
  };
}

/** تقرير ربع سنوي: 3 شهور، أفضل/أسوأ شهر، مقارنة بالربع السابق */
export function buildQuarterReport(year, quarterIndex, goals, tasksByDate, restDays) {
  const startMonth = quarterIndex * 3;
  const rangeStart = toISODate(new Date(year, startMonth, 1));
  const rangeEnd = toISODate(new Date(year, startMonth + 3, 0));
  const current = getRangeStats(rangeStart, rangeEnd, goals, tasksByDate, restDays);

  const monthStats = [0, 1, 2].map((i) => {
    const m = startMonth + i;
    const mStart = toISODate(new Date(year, m, 1));
    const mEnd = toISODate(new Date(year, m + 1, 0));
    return { label: ARABIC_MONTHS[m], ...getRangeStats(mStart, mEnd, goals, tasksByDate, restDays) };
  });
  const bestMonth = monthStats.reduce((a, b) => (b.percentage > a.percentage ? b : a));
  const worstMonth = monthStats.reduce((a, b) => (b.percentage < a.percentage ? b : a));

  const prevQuarter = quarterIndex === 0 ? 3 : quarterIndex - 1;
  const prevYear = quarterIndex === 0 ? year - 1 : year;
  const prevStartMonth = prevQuarter * 3;
  const prevStart = toISODate(new Date(prevYear, prevStartMonth, 1));
  const prevEnd = toISODate(new Date(prevYear, prevStartMonth + 3, 0));
  const previous = getRangeStats(prevStart, prevEnd, goals, tasksByDate, restDays);

  return {
    ...current,
    label: `الربع ${quarterIndex + 1} — ${year}`,
    monthStats,
    bestMonth,
    worstMonth,
    comparison: diffLabel(current.percentage, previous.percentage),
    previousPercentage: previous.percentage,
  };
}

/** تقرير سنوي كامل: كل الشهور، أفضل أسبوع/يوم، تقدّم كل هدف خلال السنة */
export function buildYearReport(year, goals, tasksByDate, restDays) {
  const rangeStart = `${year}-01-01`;
  const rangeEnd = `${year}-12-31`;
  const current = getRangeStats(rangeStart, rangeEnd, goals, tasksByDate, restDays);

  const monthStats = Array.from({ length: 12 }, (_, m) => {
    const mStart = toISODate(new Date(year, m, 1));
    const mEnd = toISODate(new Date(year, m + 1, 0));
    return { label: ARABIC_MONTHS[m], ...getRangeStats(mStart, mEnd, goals, tasksByDate, restDays) };
  });
  const bestMonth = monthStats.reduce((a, b) => (b.percentage > a.percentage ? b : a));
  const worstMonth = monthStats.reduce((a, b) => (b.percentage < a.percentage ? b : a));

  const previous = getRangeStats(`${year - 1}-01-01`, `${year - 1}-12-31`, goals, tasksByDate, restDays);

  return {
    ...current,
    label: String(year),
    monthStats,
    bestMonth,
    worstMonth,
    comparison: diffLabel(current.percentage, previous.percentage),
    previousPercentage: previous.percentage,
    goalsYearProgress: current.goalStats,
  };
}