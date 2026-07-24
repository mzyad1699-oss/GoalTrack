import supabaseClient from './supabaseClient.js';

// ============================================================
// طبقة البيانات: Supabase هو المصدر الرئيسي + IndexedDB كـ Cache
// يعمل التطبيق حتى مع انقطاع الإنترنت، ثم يزامن تلقائيًا عند عودته
// ============================================================

const DB_NAME = 'goaltrack_cache';
const DB_VERSION = 2; // تم رفعها بعد إضافة جداول المراحل 2 و3 و6 — لازم ترفع مرة تانية لو ضفت جدول جديد
const STORES = ['goals', 'tasks', 'rest_days', 'week_notes', 'user_stats', 'user_achievements', 'templates', 'profiles', 'sync_queue'];

let idbInstance = null;

/** فتح/إنشاء قاعدة الـ IndexedDB المحلية */
function openIDB() {
  return new Promise((resolve, reject) => {
    if (idbInstance) return resolve(idbInstance);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };

    request.onsuccess = (event) => {
      idbInstance = event.target.result;
      resolve(idbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

async function idbPutAll(storeName, rows) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    rows.forEach((row) => store.put(row));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(storeName, id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** إضافة عملية إلى طابور المزامنة (تُستخدم وقت عدم توفر الإنترنت) */
async function queueSync(table, action, payload) {
  await idbPutAll('sync_queue', [{ id: `${Date.now()}-${Math.random()}`, table, action, payload }]);
}

/** محاولة تفريغ طابور المزامنة إلى Supabase */
async function flushSyncQueue() {
  const queued = await idbGetAll('sync_queue');
  for (const item of queued) {
    try {
      if (item.action === 'upsert') {
        await supabaseClient.from(item.table).upsert(item.payload);
      } else if (item.action === 'delete') {
        await supabaseClient.from(item.table).delete().eq('id', item.payload.id);
      }
      await idbDelete('sync_queue', item.id);
    } catch (err) {
      // لو لسه مفيش إنترنت هيفشل ويحاول تاني بعدين
      console.warn('فشلت مزامنة عنصر، هيتحاول لاحقًا', err);
    }
  }
}

// إعادة المزامنة تلقائيًا عند رجوع الاتصال
window.addEventListener('online', () => {
  flushSyncQueue();
});

export const DB = {
  isOnline() {
    return navigator.onLine;
  },

  /** جلب صفوف مع الاعتماد على Supabase أولًا، والرجوع للكاش عند انقطاع الاتصال */
  async fetchTable(table, filterFn = null) {
    if (this.isOnline()) {
      try {
        const { data, error } = await supabaseClient.from(table).select('*');
        if (error) throw error;
        await idbPutAll(table, data);
        return filterFn ? data.filter(filterFn) : data;
      } catch (err) {
        console.warn(`تعذر الوصول لـ Supabase (${table})، هيتم استخدام الكاش`, err);
      }
    }
    const cached = await idbGetAll(table);
    return filterFn ? cached.filter(filterFn) : cached;
  },

  /** حفظ/تحديث صف: يحفظ في الكاش فورًا، ويحاول المزامنة مع Supabase */
  async upsertRow(table, row) {
    await idbPutAll(table, [row]);
    if (this.isOnline()) {
      try {
        const { error } = await supabaseClient.from(table).upsert(row);
        if (error) throw error;
        return;
      } catch (err) {
        console.warn('فشل الحفظ المباشر، هيتم الحفظ في طابور المزامنة', err);
      }
    }
    await queueSync(table, 'upsert', row);
  },

  /** حذف صف */
  async deleteRow(table, id) {
    await idbDelete(table, id);
    if (this.isOnline()) {
      try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) throw error;
        return;
      } catch (err) {
        console.warn('فشل الحذف المباشر، هيتم الحذف في طابور المزامنة', err);
      }
    }
    await queueSync(table, 'delete', { id });
  },

  flushSyncQueue,
};