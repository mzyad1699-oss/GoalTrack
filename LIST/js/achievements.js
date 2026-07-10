// ============================================================
// كتالوج الإنجازات (Achievements)
// كل إنجاز له: id ثابت، اسم، وصف، أيقونة، وشرط الفتح (بيرجع true/false)
// stats المُمرر للـ condition من نوع GlobalStats + fullWeeks/fullMonths/coins/level
// ============================================================

export const ACHIEVEMENTS = [
  { id: 'first_week', icon: '🏁', name: 'أول أسبوع كامل', desc: 'أنهيت كل مهام أسبوع بنسبة 100%', condition: (s) => s.fullWeeks >= 1 },
  { id: 'first_month', icon: '🗓️', name: 'أول شهر كامل', desc: '4 أسابيع متتالية بنسبة 100%', condition: (s) => s.fullMonths >= 1 },
  { id: 'streak_7', icon: '🔥', name: 'أسبوع من الالتزام', desc: '7 أيام متتالية من الإنجاز', condition: (s) => s.bestStreak >= 7 },
  { id: 'streak_30', icon: '🔥', name: 'شهر من الالتزام', desc: '30 يوم متتالي من الإنجاز', condition: (s) => s.bestStreak >= 30 },
  { id: 'streak_100', icon: '🐉', name: 'مئة يوم أسطورية', desc: '100 يوم متتالي من الإنجاز', condition: (s) => s.bestStreak >= 100 },
  { id: 'tasks_100', icon: '✅', name: '100 مهمة', desc: 'أنجزت 100 مهمة إجمالًا', condition: (s) => s.totalTasksCompleted >= 100 },
  { id: 'tasks_500', icon: '✅', name: '500 مهمة', desc: 'أنجزت 500 مهمة إجمالًا', condition: (s) => s.totalTasksCompleted >= 500 },
  { id: 'tasks_1000', icon: '💎', name: '1000 مهمة', desc: 'أنجزت 1000 مهمة إجمالًا', condition: (s) => s.totalTasksCompleted >= 1000 },
  { id: 'points_1000', icon: '⭐', name: '1000 نقطة خبرة', desc: 'جمعت 1000 XP', condition: (s) => s.totalPointsEarned >= 1000 },
  { id: 'points_10000', icon: '🌟', name: '10000 نقطة خبرة', desc: 'جمعت 10000 XP', condition: (s) => s.totalPointsEarned >= 10000 },
  { id: 'points_50000', icon: '👑', name: '50000 نقطة خبرة', desc: 'جمعت 50000 XP', condition: (s) => s.totalPointsEarned >= 50000 },
  { id: 'level_5', icon: '🥉', name: 'المستوى 5', desc: 'وصلت للمستوى 5', condition: (s) => s.level >= 5 },
  { id: 'level_10', icon: '🥈', name: 'المستوى 10', desc: 'وصلت للمستوى 10', condition: (s) => s.level >= 10 },
  { id: 'level_25', icon: '🥇', name: 'المستوى 25', desc: 'وصلت للمستوى 25', condition: (s) => s.level >= 25 },
  { id: 'coins_100', icon: '🪙', name: 'جامع العملات', desc: 'جمعت 100 عملة', condition: (s) => s.coins >= 100 },
  { id: 'goals_5', icon: '🎯', name: 'خمسة أهداف', desc: 'أضفت 5 أهداف مختلفة', condition: (s) => s.goalsCount >= 5 },
  { id: 'rest_master', icon: '🌿', name: 'وقت للراحة', desc: 'أخذت أول يوم راحة لك', condition: (s) => s.restDaysCount >= 1 },
];

/**
 * فحص الإنجازات الجديدة اللي المستخدم استحقها ولسه مش مسجلة عنده
 * @param {object} stats كل الإحصائيات المطلوبة لفحص الشروط
 * @param {Set<string>} unlockedIds الإنجازات المفتوحة بالفعل
 * @returns {Array} الإنجازات الجديدة اللي اتفتحت الآن
 */
export function checkNewlyUnlocked(stats, unlockedIds) {
  return ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id) && a.condition(stats));
}
