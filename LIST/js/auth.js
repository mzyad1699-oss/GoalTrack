import supabaseClient from './supabaseClient.js';

// ============================================================
// وحدة المصادقة (Authentication Module)
// ============================================================

export const Auth = {
  /** تسجيل حساب جديد بالبريد الإلكتروني */
  async signUp(email, password, fullName) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  },

  /** تسجيل الدخول بالبريد الإلكتروني */
  async signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /** تسجيل الدخول بواسطة جوجل */
  async signInWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return data;
  },

  /** تسجيل الخروج */
  async signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  },

  /** إرسال رابط إعادة تعيين كلمة المرور */
  async resetPassword(email) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset=true`,
    });
    if (error) throw error;
  },

  /** تحديث كلمة المرور (بعد الضغط على رابط الإيميل) */
  async updatePassword(newPassword) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /** جلب المستخدم الحالي */
  async getCurrentUser() {
    const { data } = await supabaseClient.auth.getUser();
    return data?.user || null;
  },

  /** الاستماع لتغيّر حالة تسجيل الدخول */
  onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  },
};
