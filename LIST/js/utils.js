// ============================================================
// دوال مساعدة عامة
// ============================================================

/** أسماء الأيام بدءًا من السبت (الترتيب الافتراضي) — يُستخدم مع getRotatedDayNames لأي يوم بداية تاني */
export const DAY_NAMES_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

/** JS getDay(): الأحد=0 ... السبت=6 — دي قيم week_start_day المسموحة */
export const WEEK_START_OPTIONS = [
  { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
];

/** إرجاع أسماء الأيام السبعة مبدوءة بيوم البداية المختار */
export function getRotatedDayNames(weekStartDay = 6) {
  return [...DAY_NAMES_AR_BY_JS_DAY.slice(weekStartDay), ...DAY_NAMES_AR_BY_JS_DAY.slice(0, weekStartDay)];
}
// فهرس أسماء الأيام مرتب بترتيب JS (الأحد=0 ... السبت=6) لتسهيل التدوير
const DAY_NAMES_AR_BY_JS_DAY = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** توليد UUID بسيط للاستخدام كمعرف صف قبل إرساله لـ Supabase */
export function generateId() {
  return crypto.randomUUID();
}

/** تحويل تاريخ JS لصيغة YYYY-MM-DD */
export function toISODate(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * إرجاع مصفوفة من 7 تواريخ تمثل الأسبوع الحالي، بدءًا من يوم البداية المختار (افتراضيًا السبت)
 * @param {Date} referenceDate تاريخ داخل الأسبوع المطلوب (افتراضيًا اليوم)
 * @param {number} weekStartDay قيمة getDay() ليوم بداية الأسبوع (6=سبت، 0=أحد، 1=اثنين)
 */
export function getWeekDates(referenceDate = new Date(), weekStartDay = 6) {
  const date = new Date(referenceDate);
  const jsDay = date.getDay();
  const offset = (jsDay - weekStartDay + 7) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - offset);

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    week.push(toISODate(d));
  }
  return week;
}

/** حساب النسبة المئوية للإنجاز */
export function calcPercentage(done, total) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

/** تحديد التقدير (Grade) حسب النسبة */
export function calcGrade(percentage) {
  if (percentage >= 95) return 'A+';
  if (percentage >= 85) return 'A';
  if (percentage >= 75) return 'B+';
  if (percentage >= 65) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 35) return 'D';
  return 'F';
}

/** تنسيق تاريخ لعرضه بشكل مقروء بالعربي */
export function formatArabicDate(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** عرض رسالة Toast بسيطة */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/** إضافة عدد أيام لتاريخ ISO وإرجاع تاريخ ISO جديد */
export function addDays(isoDate, delta) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/**
 * بناء شبكة أيام شهر معيّن، محاذاة حسب يوم بداية الأسبوع المختار
 * كل خلية إما تاريخ ISO أو null لو خارج الشهر
 */
export function getMonthGrid(year, monthIndex, weekStartDay = 6) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startOffset = (firstDay.getDay() - weekStartDay + 7) % 7;
  const daysInMonth = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISODate(new Date(year, monthIndex, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * بناء أسابيع كاملة (7 أيام) تغطي سنة معيّنة بالكامل — أساس الـ Heatmap
 * بعض تواريخ الأسبوع الأول/الأخير ممكن تكون خارج السنة (هيتم إخفاؤها في الرسم)
 */
export function buildHeatmapWeeks(year, weekStartDay = 6) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const startOffset = (yearStart.getDay() - weekStartDay + 7) % 7;
  const gridStart = new Date(yearStart);
  gridStart.setDate(yearStart.getDate() - startOffset);

  const endOffset = 6 - ((yearEnd.getDay() - weekStartDay + 7) % 7);
  const gridEnd = new Date(yearEnd);
  gridEnd.setDate(yearEnd.getDate() + endOffset);

  const weeks = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(toISODate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Debounce بسيط لتقليل عدد مرات الحفظ أثناء الكتابة في الملاحظات */
export function debounce(fn, delay = 500) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}