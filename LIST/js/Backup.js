// ============================================================
// النسخ الاحتياطي: Export / Import + Auto Backup محلي
// ============================================================

const AUTO_BACKUP_PREFIX = 'goaltrack_autobackup_';

/** تجميع كل بيانات المستخدم في هيكل واحد قابل للتصدير */
export function buildExportPayload(state) {
  const tasks = [];
  Object.values(state.tasksByDate).forEach((dayTasks) => {
    Object.values(dayTasks).forEach((t) => tasks.push(t));
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    goals: state.goals,
    tasks,
    restDays: [...state.restDays],
    weekNotes: state.allWeekNotes,
    userStats: state.userStats,
    unlockedAchievements: [...state.unlockedAchievementIds],
  };
}

/** تنزيل بيانات كملف JSON على جهاز المستخدم */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** قراءة ملف JSON مُستورد من المستخدم والتحقق من شكله الأساسي */
export function readImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.goals)) {
          throw new Error('صيغة الملف غير صحيحة');
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** حفظ نسخة تلقائية في localStorage (خفيفة، محليًا فقط) */
export function saveAutoBackup(userId, state) {
  try {
    const payload = buildExportPayload(state);
    localStorage.setItem(AUTO_BACKUP_PREFIX + userId, JSON.stringify(payload));
  } catch (err) {
    console.warn('تعذر حفظ النسخة الاحتياطية التلقائية', err);
  }
}

/** جلب معلومات آخر نسخة احتياطية تلقائية محفوظة */
export function getAutoBackupInfo(userId) {
  const raw = localStorage.getItem(AUTO_BACKUP_PREFIX + userId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return { exportedAt: parsed.exportedAt, payload: parsed };
  } catch {
    return null;
  }
}