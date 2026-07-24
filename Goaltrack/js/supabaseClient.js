// ============================================================
// إعداد الاتصال بـ Supabase
// ============================================================
// خطوات التفعيل:
// 1) روح على https://supabase.com وأنشئ مشروع جديد (مجاني).
// 2) من Project Settings -> API خد الـ "Project URL" و الـ "anon public key".
// 3) حطهم مكان القيم تحت.
// 4) شغّل ملف sql/schema.sql كامل من Supabase -> SQL Editor.
// 5) لتفعيل تسجيل الدخول بجوجل: Authentication -> Providers -> Google
//    وفعّلها وحط Client ID / Secret بتاعين مشروعك في Google Cloud Console.
// ============================================================

const SUPABASE_URL = 'https://exbwqsmmexncdassjvsc.supabase.co'; // مثال: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_xfdzqF39TXH6F3dvWyxMFg_B5PhBy5X';

// يتم تحميل مكتبة supabase-js من CDN داخل index.html قبل هذا الملف
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabaseClient;
