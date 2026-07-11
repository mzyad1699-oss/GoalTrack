import { DAY_NAMES_AR, formatArabicDate, ARABIC_MONTHS } from './utils.js';

// ============================================================
// مكونات واجهة قابلة لإعادة الاستخدام
// ============================================================

/** شبكة تقويم شهرية تفاعلية */
export function renderCalendarGrid(cells, dayCompletionFn, restDays, todayISO, dayNames = DAY_NAMES_AR) {
  const headerRow = dayNames.map((d) => `<div class="cal-weekday">${d}</div>`).join('');
  const dayCells = cells
    .map((date) => {
      if (!date) return `<div class="cal-cell cal-cell--empty"></div>`;
      const isRest = restDays.has(date);
      const completion = dayCompletionFn(date);
      let cls = 'cal-cell';
      if (isRest) cls += ' cal-cell--rest';
      else if (completion === 100) cls += ' cal-cell--full';
      else if (completion > 0) cls += ' cal-cell--partial';
      if (date === todayISO) cls += ' cal-cell--today';
      const dayNum = date.slice(-2).replace(/^0/, '');
      return `<button class="${cls}" data-date="${date}">${dayNum}</button>`;
    })
    .join('');
  return `<div class="cal-grid">${headerRow}${dayCells}</div>`;
}

/** Heatmap سنوي بأسلوب GitHub */
export function renderHeatmap(weeks, year, dayCompletionFn, restDays) {
  const cellSize = 11;
  const gap = 3;
  const width = weeks.length * (cellSize + gap);
  const height = 7 * (cellSize + gap) + 20;

  let monthLabels = '';
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstOfMonth = week.find((d) => d.slice(0, 4) === String(year) && Number(d.slice(-2)) <= 7);
    if (firstOfMonth) {
      const month = Number(firstOfMonth.slice(5, 7)) - 1;
      if (month !== lastMonth) {
        monthLabels += `<text x="${wi * (cellSize + gap)}" y="10" class="heatmap-month-label">${ARABIC_MONTHS[month]}</text>`;
        lastMonth = month;
      }
    }
  });

  let cells = '';
  weeks.forEach((week, wi) => {
    week.forEach((date, di) => {
      if (date.slice(0, 4) !== String(year)) return; // إخفاء أيام خارج السنة
      const isRest = restDays.has(date);
      const completion = dayCompletionFn(date);
      let levelClass = 'heat-l0';
      if (isRest) levelClass = 'heat-rest';
      else if (completion === 100) levelClass = 'heat-l4';
      else if (completion >= 50) levelClass = 'heat-l3';
      else if (completion > 0) levelClass = 'heat-l2';
      else if (completion === 0) levelClass = 'heat-l1';

      const x = wi * (cellSize + gap);
      const y = di * (cellSize + gap) + 20;
      cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" class="heat-cell ${levelClass}"><title>${formatArabicDate(date)} — ${completion === null ? 'لا بيانات' : completion + '%'}</title></rect>`;
    });
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="heatmap-svg">${monthLabels}${cells}</svg>`;
}

/** نتيجة بحث واحدة (مهمة / هدف / ملاحظة أسبوع) */
export function renderSearchResult(result) {
  const typeLabel = { task: 'ملاحظة مهمة', goal: 'هدف', week_note: 'ملاحظة أسبوع' }[result.type];
  return `
    <button class="search-result" data-date="${result.date || ''}">
      <span class="search-result__type">${typeLabel}</span>
      <span class="search-result__title">${result.title}</span>
      <span class="search-result__snippet">${result.snippet}</span>
      ${result.date ? `<span class="search-result__date">${formatArabicDate(result.date)}</span>` : ''}
    </button>
  `;
}

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
export function renderDayStones(weekDates, completionMap, restDaysSet, selectedDate, dayNames = DAY_NAMES_AR) {
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
              <span class="day-stone__label">${dayNames[index]}</span>
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

/** شبكة إحصائيات عامة لأي تقرير */
export function renderStatGrid(items) {
  return `
    <div class="stat-grid">
      ${items
        .map(
          (it) => `
        <div class="stat-box">
          <div class="stat-box__value">${it.value}</div>
          <div class="stat-box__label">${it.label}</div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

/** بطاقة تقرير كاملة (أسبوعي/شهري/ربعي/سنوي) */
export function renderReportCard(report, dateFormatter) {
  const cmp = report.comparison;
  const cmpHtml = cmp
    ? `<div class="report-compare ${cmp.isImprovement ? 'report-compare--up' : 'report-compare--down'}">
         ${cmp.isImprovement ? '▲' : '▼'} ${Math.abs(cmp.diff)}% مقارنة بالفترة السابقة (${report.previousPercentage}%)
       </div>`
    : '';

  const stats = [
    { label: 'نسبة الإنجاز', value: `${report.percentage}%` },
    { label: 'التقدير', value: report.grade },
    { label: 'النقاط', value: `${report.pointsEarned} / ${report.pointsTotal}` },
    { label: 'المهام المنجزة', value: `${report.completedTasks} / ${report.totalTasks}` },
    { label: 'أيام الراحة', value: report.restDaysCount },
  ];

  const bestWorstHtml = `
    <div class="report-row">
      ${report.bestDay ? `<span>🌟 أفضل يوم: ${dateFormatter(report.bestDay.date)} (${report.bestDay.percentage}%)</span>` : ''}
      ${report.worstDay ? `<span>📉 أضعف يوم: ${dateFormatter(report.worstDay.date)} (${report.worstDay.percentage}%)</span>` : ''}
    </div>
    <div class="report-row">
      ${report.bestGoal && report.bestGoal.total > 0 ? `<span>🏆 أفضل هدف: ${report.bestGoal.name}</span>` : ''}
      ${report.worstGoal && report.worstGoal.total > 0 ? `<span>🔻 أقل هدف: ${report.worstGoal.name}</span>` : ''}
    </div>
  `;

  return `
    ${cmpHtml}
    ${renderStatGrid(stats)}
    ${bestWorstHtml}
  `;
}

/** أشرطة تقدم الأهداف خلال السنة */
export function renderGoalYearProgress(goalStats) {
  if (goalStats.length === 0) return `<div class="empty-state">لا توجد أهداف بعد</div>`;
  return goalStats
    .map((g) => {
      const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
      return `
        <div class="year-progress-row">
          <div class="year-progress-row__label"><span>${g.name}</span><span>${pct}%</span></div>
          <div class="year-progress-row__track"><div class="year-progress-row__fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join('');
}

/** بطاقة Template داخل صفحة Explore */
export function renderTemplateCard(template, isMine) {
  const goalsPreview = (template.goals || []).slice(0, 5).map((g) => g.name).join(' • ');
  return `
    <div class="template-card">
      <div class="template-card__title">${template.title}</div>
      <div class="template-card__desc">${template.description || ''}</div>
      <div class="template-card__goals">${goalsPreview}${template.goals?.length > 5 ? ' ...' : ''}</div>
      <div class="template-card__footer">
        <span>📋 ${template.goals?.length || 0} أهداف · استُخدم ${template.uses_count || 0} مرة</span>
        ${isMine ? '' : `<button class="btn btn--primary js-copy-template" data-template-id="${template.id}" style="width:auto;padding:6px 14px;font-size:12px;">نسخ لحسابي</button>`}
      </div>
    </div>
  `;
}

/** شريط المستوى والخبرة (XP) */
export function renderLevelBar(levelInfo) {
  return `
    <div class="level-bar">
      <div class="level-bar__badge">Lv ${levelInfo.level}</div>
      <div class="level-bar__track">
        <div class="level-bar__fill" style="width:${levelInfo.progressPercent}%"></div>
      </div>
      <div class="level-bar__xp">${levelInfo.xpIntoLevel} / ${levelInfo.xpForNextLevel} XP</div>
    </div>
  `;
}

/** شارتا الـ Streak والعملات بجانب بعض */
export function renderStreakAndCoins(currentStreak, bestStreak, coins) {
  return `
    <div class="stat-pill" title="أفضل سلسلة: ${bestStreak} يوم">
      <span>🔥</span>
      <span>${currentStreak} يوم متتالي</span>
    </div>
    <div class="stat-pill">
      <span>🪙</span>
      <span>${coins} عملة</span>
    </div>
  `;
}

/** محتوى القائمة المنسدلة السريعة لتبديل الحساب (الحساب الحالي + الباقي) */
export function renderAccountDropdownList(currentUser, otherAccounts) {
  const currentLabel = currentUser.user_metadata?.full_name || currentUser.email;
  const currentInitial = (currentLabel || '؟').trim().charAt(0).toUpperCase();

  const currentItem = `
    <div class="account-dropdown-item account-dropdown-item--current">
      <div class="account-dropdown-item__avatar">${currentInitial}</div>
      <span class="account-dropdown-item__email">${currentUser.email}</span>
      <span class="account-dropdown-item__check">✓</span>
    </div>
  `;

  const otherItems = otherAccounts
    .map((a) => {
      const label = a.fullName || a.email;
      const initial = (label || '؟').trim().charAt(0).toUpperCase();
      return `
        <button class="account-dropdown-item js-dropdown-switch" data-user-id="${a.userId}">
          <div class="account-dropdown-item__avatar">${initial}</div>
          <span class="account-dropdown-item__email">${a.email}</span>
        </button>
      `;
    })
    .join('');

  return currentItem + otherItems;
}

/** صف حساب محفوظ داخل قائمة "بدّل لحساب" بصفحة حسابي */
export function renderAccountRow(account) {
  const label = account.fullName || account.email;
  const initial = (label || '؟').trim().charAt(0).toUpperCase();
  return `
    <div class="account-row">
      <div class="account-row__avatar">${initial}</div>
      <div class="account-row__info">
        <span class="account-row__name">${label}</span>
        <span class="account-row__email">${account.email}</span>
      </div>
      <button class="btn btn--primary js-switch-account" data-user-id="${account.userId}" style="width:auto;padding:7px 14px;font-size:12px;">تبديل</button>
      <button class="account-row__forget js-forget-account" data-user-id="${account.userId}" title="إزالة من القائمة">✕</button>
    </div>
  `;
}

/** بطاقة إنجاز مفردة داخل شبكة الإنجازات */
export function renderAchievementCard(achievement, isUnlocked) {
  return `
    <div class="achievement-card ${isUnlocked ? 'achievement-card--unlocked' : 'achievement-card--locked'}">
      <div class="achievement-card__icon">${achievement.icon}</div>
      <div class="achievement-card__name">${achievement.name}</div>
      <div class="achievement-card__desc">${achievement.desc}</div>
    </div>
  `;
}

/** نافذة منبثقة عند فتح إنجاز جديد + Animation */
export function renderAchievementPopup(achievement) {
  return `
    <div class="achievement-popup__icon">${achievement.icon}</div>
    <div class="achievement-popup__label">إنجاز جديد!</div>
    <div class="achievement-popup__name">${achievement.name}</div>
    <div class="achievement-popup__desc">${achievement.desc}</div>
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