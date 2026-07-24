// ============================================================
// إدارة الحسابات المتعددة على نفس الجهاز
// بتحفظ Session لكل حساب سجّلت دخول بيه قبل كده محليًا (localStorage)،
// عشان تقدر تبدّل بينهم بضغطة واحدة من غير ما تكتب الباسورد تاني.
//
// ⚠️ اعتبار أمني: التوكنز دي بتتخزن في localStorage زي أي Session عادية
// من Supabase. متستخدمش الميزة دي على جهاز مشترك، واستخدم زرار "إزالة"
// عشان تشيل أي حساب من القائمة وقت ما تخلص منه.
// ============================================================

const KNOWN_ACCOUNTS_KEY = 'goaltrack_known_accounts';

function getKnownAccounts() {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveKnownAccounts(list) {
  try {
    localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('تعذر حفظ قائمة الحسابات', err);
  }
}

/** حفظ/تحديث بيانات جلسة المستخدم الحالي في قائمة الحسابات المعروفة */
export async function rememberCurrentSession(supabaseClient, user) {
  if (!user) return;
  const { data } = await supabaseClient.auth.getSession();
  const session = data?.session;
  if (!session) return;

  const accounts = getKnownAccounts();
  const idx = accounts.findIndex((a) => a.userId === user.id);
  const entry = {
    userId: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name || '',
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    savedAt: new Date().toISOString(),
  };
  if (idx >= 0) accounts[idx] = entry;
  else accounts.push(entry);
  saveKnownAccounts(accounts);
}

/** كل الحسابات المحفوظة عدا الحساب الحالي (اللي هيظهر في قائمة "بدّل لحساب") */
export function getOtherAccounts(currentUserId) {
  return getKnownAccounts().filter((a) => a.userId !== currentUserId);
}

/** إزالة حساب من القائمة المحفوظة على الجهاز (من غير ما يمسح الحساب نفسه) */
export function forgetAccount(userId) {
  saveKnownAccounts(getKnownAccounts().filter((a) => a.userId !== userId));
}

/** التبديل الفعلي لحساب محفوظ باستخدام الـ Session المحفوظة له (من غير باسورد) */
export async function switchToAccount(supabaseClient, userId) {
  const accounts = getKnownAccounts();
  const account = accounts.find((a) => a.userId === userId);
  if (!account) throw new Error('الحساب ده مش محفوظ على الجهاز ده');

  const { error } = await supabaseClient.auth.setSession({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  if (error) {
    forgetAccount(userId); // الأغلب التوكن انتهت صلاحيته
    throw new Error('انتهت صلاحية جلسة هذا الحساب، سجّل الدخول بيه تاني بالباسورد');
  }
}