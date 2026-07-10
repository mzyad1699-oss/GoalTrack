// ============================================================
// نظام التنقل (Navigation): صفحات تفتح كـ Tabs زي Notion/Discord
// "حسابي" هي الاستثناء الوحيد — بتفتح Full-screen وبرّه نظام الـ Tabs
// ============================================================

const TABS_STORAGE_PREFIX = 'goaltrack_tabs_';

/** تعريف كل صفحة ممكن تتفتح كـ Tab (الترتيب هنا = ترتيب افتراضي، مش شرط) */
export const PAGES = {
  home: { icon: '🧭', label: 'الرئيسية', closable: false },
  calendar: { icon: '📅', label: 'التقويم', closable: true },
  stats: { icon: '📊', label: 'الإحصائيات', closable: true },
  achievements: { icon: '🏆', label: 'الإنجازات', closable: true },
  explore: { icon: '🌍', label: 'استكشاف', closable: true },
};

const nav = {
  userId: null,
  openTabs: ['home'],
  activeTab: 'home',
  preProfileState: null, // بيتحفظ فيه آخر حالة Tabs قبل الدخول على "حسابي"
};

function storageKey() {
  return TABS_STORAGE_PREFIX + nav.userId;
}

function persist() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ openTabs: nav.openTabs, activeTab: nav.activeTab }));
  } catch (err) {
    console.warn('تعذر حفظ حالة الـ Tabs', err);
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.openTabs) && parsed.openTabs.includes('home')) {
      nav.openTabs = parsed.openTabs.filter((id) => PAGES[id]);
      nav.activeTab = PAGES[parsed.activeTab] ? parsed.activeTab : 'home';
    }
  } catch (err) {
    console.warn('تعذر قراءة حالة الـ Tabs المحفوظة', err);
  }
}

/** بناء شريط الـ Tabs في الـ DOM وربط أحداثه */
function renderTabBar() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.innerHTML = nav.openTabs
    .map((id) => {
      const page = PAGES[id];
      const isActive = id === nav.activeTab;
      const closeBtn = page.closable ? `<span class="tab-item__close" data-close="${id}">✕</span>` : '';
      return `
        <button class="tab-item ${isActive ? 'tab-item--active' : ''}" data-tab-open="${id}">
          <span>${page.icon}</span><span>${page.label}</span>${closeBtn}
        </button>
      `;
    })
    .join('');
}

/** إظهار الصفحة النشطة فقط وإخفاء الباقي */
function renderPageVisibility() {
  Object.keys(PAGES).forEach((id) => {
    const pageEl = document.getElementById(`page-${id}`);
    if (pageEl) pageEl.classList.toggle('hidden', id !== nav.activeTab);
  });
}

/** تمييز عنصر القائمة الجانبية المطابق للـ Tab النشط */
function updateSidebarHighlight() {
  document.querySelectorAll('#nav-list .nav-item[data-page]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.page === nav.activeTab && !isProfileOpen());
  });
  const profileItem = document.getElementById('nav-profile');
  if (profileItem) profileItem.classList.toggle('is-active', isProfileOpen());
}

function isProfileOpen() {
  const profilePage = document.getElementById('page-profile');
  return profilePage && !profilePage.classList.contains('hidden');
}

function renderAllNav() {
  renderTabBar();
  renderPageVisibility();
  updateSidebarHighlight();
}

/** فتح صفحة كـ Tab (أو التبديل لها لو مفتوحة بالفعل) */
export function openTab(pageId) {
  if (!PAGES[pageId]) return;
  if (isProfileOpen()) closeProfile(false);
  if (!nav.openTabs.includes(pageId)) nav.openTabs.push(pageId);
  nav.activeTab = pageId;
  renderAllNav();
  persist();
}

/** إغلاق Tab معيّن (الرئيسية مينفعش تتقفل) */
export function closeTab(pageId) {
  const page = PAGES[pageId];
  if (!page || !page.closable) return;
  nav.openTabs = nav.openTabs.filter((id) => id !== pageId);
  if (nav.activeTab === pageId) {
    nav.activeTab = nav.openTabs[nav.openTabs.length - 1] || 'home';
  }
  renderAllNav();
  persist();
}

/** فتح صفحة "حسابي": بتحفظ آخر حالة Tabs وتفتح صفحة مستقلة Full-screen */
export function openProfile() {
  nav.preProfileState = { openTabs: [...nav.openTabs], activeTab: nav.activeTab };
  document.getElementById('tab-bar')?.classList.add('hidden');
  Object.keys(PAGES).forEach((id) => document.getElementById(`page-${id}`)?.classList.add('hidden'));
  document.getElementById('page-profile')?.classList.remove('hidden');
  updateSidebarHighlight();
}

/** الرجوع من صفحة "حسابي" لنفس الـ Tabs اللي كانت مفتوحة قبلها */
export function closeProfile(restore = true) {
  document.getElementById('page-profile')?.classList.add('hidden');
  document.getElementById('tab-bar')?.classList.remove('hidden');
  if (restore && nav.preProfileState) {
    nav.openTabs = nav.preProfileState.openTabs;
    nav.activeTab = nav.preProfileState.activeTab;
  }
  renderAllNav();
  persist();
}

/** تهيئة نظام التنقل لمستخدم معيّن (يُستدعى بعد تسجيل الدخول) */
export function initNavigation(userId) {
  nav.userId = userId;
  nav.openTabs = ['home'];
  nav.activeTab = 'home';
  loadPersisted();
  renderAllNav();
}

export function getActiveTab() {
  return nav.activeTab;
}