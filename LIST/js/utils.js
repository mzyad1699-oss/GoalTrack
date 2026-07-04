// ============================================================
// دوال مساعدة عامة
// ============================================================

export const DAY_NAMES_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

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
 * إرجاع مصفوفة من 7 تواريخ تمثل الأسبوع الحالي بدءًا من السبت
 * @param {Date} referenceDate تاريخ داخل الأسبوع المطلوب (افتراضيًا اليوم)
 */
export function getWeekDates(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  // getDay(): الأحد=0 ... السبت=6. نريد السبت=0
  const jsDay = date.getDay();
  const offsetFromSaturday = (jsDay + 1) % 7;
  const saturday = new Date(date);
  saturday.setDate(date.getDate() - offsetFromSaturday);

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
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

/** Debounce بسيط لتقليل عدد مرات الحفظ أثناء الكتابة في الملاحظات */
export function debounce(fn, delay = 500) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
