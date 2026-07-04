import { DAY_NAMES_AR, formatArabicDate } from './utils.js';

// ============================================================
// مكونات واجهة قابلة لإعادة الاستخدام
// ============================================================

/**
 * دائرة التقدم الأسبوعي "بوصلة الرحلة" — العنصر البصري المميز للصفحة الرئيسية
 */
export function renderCompass(percentage, pointsEarned, pointsTotal) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  // موضع المؤشر المتوهج على المحيط حسب النسبة (يبدأ من الأعلى ويدور مع اتجاه عقارب الساعة)
  const angle = (percentage / 100) * 360 - 90;
  const markerX = 100 + radius * Math.cos((angle * Math.PI) / 180);
  const markerY = 100 + radius * Math.sin((angle * Math.PI) / 180);

  return `
    <svg viewBox="0 0 200 200" class="compass-svg" role="img" aria-label="نسبة إنجاز الأسبوع ${percentage}%">
      <circle cx="100" cy="100" r="${radius}" class="compass-track" />
      <circle
        cx="100" cy="100" r="${radius}"
        class="compass-progress"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"
      />
      ${percentage > 0 ? `<circle cx="${markerX}" cy="${markerY}" r="6" class="compass-marker" />` : ''}
      <text x="100" y="94" text-anchor="middle" class="compass-percentage">${percentage}%</text>
      <text x="100" y="118" text-anchor="middle" class="compass-subtext">${pointsEarned} / ${pointsTotal} نقطة</text>
    </svg>
  `;
}

/**
 * مسار "حجارة الأيام" أسفل البوصلة — كل يوم عبارة عن نقطة على المسار
 */
export function renderDayStones(weekDates, completionMap, restDaysSet, selectedDate) {
  return `
    <div class="day-path">
      ${weekDates
        .map((date, index) => {
          const isRest = restDaysSet.has(date);
          const completion = completionMap[date] ?? null; // null = لا مهام بعد
          const isSelected = date === selectedDate;
          const isToday = date === weekDates.find((d) => d === todayISO());
          let stoneClass = 'day-stone';
          if (isRest) stoneClass += ' day-stone--rest';
          else if (completion === 100) stoneClass += ' day-stone--full';
          else if (completion > 0) stoneClass += ' day-stone--partial';
          if (isSelected) stoneClass += ' day-stone--selected';
          if (isToday) stoneClass += ' day-stone--today';

          return `
            <button class="${stoneClass}" data-date="${date}" title="${formatArabicDate(date)}">
              <span class="day-stone__dot"></span>
              <span class="day-stone__label">${DAY_NAMES_AR[index]}</span>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * بطاقة مهمة قابلة للتعديل داخل يوم معيّن
 */
export function renderTaskCard(goal, task) {
  const isCompleted = task?.is_completed || false;
  const notes = task?.notes || '';
  const time = task?.time_of_day || '';
  const priority = task?.priority || 'medium';

  return `
    <div class="task-card ${isCompleted ? 'task-card--done' : ''}" data-goal-id="${goal.id}" style="--goal-color:${goal.color}">
      <div class="task-card__main">
        <label class="task-checkbox">
          <input type="checkbox" class="js-task-toggle" data-goal-id="${goal.id}" ${isCompleted ? 'checked' : ''} />
          <span class="task-checkbox__box"></span>
        </label>
        <div class="task-card__info">
          <span class="task-card__name">${goal.name}</span>
          <span class="task-card__points">${goal.points} نقطة</span>
        </div>
        <select class="task-priority js-task-priority" data-goal-id="${goal.id}">
          <option value="low" ${priority === 'low' ? 'selected' : ''}>منخفضة</option>
          <option value="medium" ${priority === 'medium' ? 'selected' : ''}>متوسطة</option>
          <option value="high" ${priority === 'high' ? 'selected' : ''}>عالية</option>
        </select>
        <input type="time" class="task-time js-task-time" data-goal-id="${goal.id}" value="${time}" />
      </div>
      <textarea
        class="task-notes js-task-notes"
        data-goal-id="${goal.id}"
        placeholder="ملاحظات..."
        rows="1"
      >${notes}</textarea>
    </div>
  `;
}

/** صف داخل جدول إدارة الأهداف */
export function renderGoalManagerRow(goal) {
  return `
    <div class="goal-row" data-goal-id="${goal.id}">
      <span class="goal-row__color" style="background:${goal.color}"></span>
      <input type="text" class="goal-row__name js-goal-name" data-goal-id="${goal.id}" value="${goal.name}" />
      <input type="number" min="1" class="goal-row__points js-goal-points" data-goal-id="${goal.id}" value="${goal.points}" />
      <button class="goal-row__delete js-goal-delete" data-goal-id="${goal.id}" title="حذف الهدف">✕</button>
    </div>
  `;
}
