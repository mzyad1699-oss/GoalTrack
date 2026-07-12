// ============================================================
// شاشة التحميل (Splash Screen)
// بتظهر لحظة فتح الموقع، وبتختفي بـ Fade Out بعد ما نعرف حالة تسجيل الدخول
// قابلة للتوسع مستقبلًا: تقدر تستدعي updateSplashMessage() أثناء تحميل بيانات إضافية
// ============================================================

const MIN_DISPLAY_MS = 700; // أقل مدة عرض حتى لو التحميل خلص فورًا (يمنع الوميض السريع)
let shownAt = null;

/** إظهار الشاشة (بتتنده تلقائيًا عند بدء التطبيق) */
export function showSplash() {
  shownAt = Date.now();
  const el = document.getElementById('splash-screen');
  if (el) el.classList.remove('splash--hidden');
}

/** تحديث نص الحالة أسفل الشعار (مفيد لو أضفنا خطوات تحميل تانية مستقبلًا) */
export function updateSplashMessage(text) {
  const el = document.getElementById('splash-message');
  if (el) el.textContent = text;
}

/** إخفاء الشاشة بـ Fade Out، مع احترام أقل مدة عرض */
export function hideSplash() {
  const el = document.getElementById('splash-screen');
  if (!el || el.classList.contains('splash--hidden')) return;
  const elapsed = shownAt ? Date.now() - shownAt : MIN_DISPLAY_MS;
  const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
  setTimeout(() => {
    el.classList.add('splash--hidden');
    setTimeout(() => el.remove(), 500); // يتشال من الـ DOM بعد ما الـ Fade يخلص
  }, remaining);
}

/**
 * إظهار شاشة خطأ تحميل مستقلة عن الـ Splash (بتُستخدم لما التهيئة تفشل أو تتأخر أكتر من اللازم)
 * فيها زرار "إعادة المحاولة" بيعمل Reload كامل للصفحة كأبسط وأضمن طريقة استرجاع
 */
export function showLoadError(message = 'تعذر تحميل التطبيق، حاول إعادة المحاولة') {
  const el = document.getElementById('init-error-screen');
  if (!el) return;
  el.querySelector('#init-error-message').textContent = message;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('init-error-screen--visible'));

  const retryBtn = el.querySelector('#btn-init-retry');
  retryBtn.onclick = () => window.location.reload();
}