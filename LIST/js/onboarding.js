import { WEEK_START_OPTIONS, toISODate } from './utils.js';

// ============================================================
// معالج الإعداد الأول (Onboarding Wizard)
// 3 خطوات: تاريخ البداية → يوم بداية الأسبوع → أول مجموعة أهداف
// الوحدة دي مسؤولة بس عن واجهة المعالج؛ الحفظ الفعلي بيحصل في app.js عبر onComplete
// ============================================================

let currentStep = 1;
const TOTAL_STEPS = 3;
let draftGoals = []; // [{ name, points }]
let onCompleteCallback = null;

function el(id) {
  return document.getElementById(id);
}

function renderStepIndicator() {
  el('onboarding-progress').innerHTML = Array.from({ length: TOTAL_STEPS }, (_, i) => {
    const step = i + 1;
    const cls = step === currentStep ? 'onboarding-dot onboarding-dot--active' : step < currentStep ? 'onboarding-dot onboarding-dot--done' : 'onboarding-dot';
    return `<span class="${cls}"></span>`;
  }).join('');
}

function showStep(step) {
  currentStep = step;
  [1, 2, 3].forEach((s) => el(`onboarding-step-${s}`).classList.toggle('hidden', s !== step));
  renderStepIndicator();
}

function renderDraftGoalsList() {
  el('onboarding-goals-list').innerHTML = draftGoals.length
    ? draftGoals
        .map(
          (g, i) => `
        <div class="onboarding-goal-chip">
          <span>${g.name} · ${g.points} نقطة</span>
          <button type="button" class="onboarding-goal-chip__remove" data-index="${i}">✕</button>
        </div>`
        )
        .join('')
    : `<p class="onboarding-hint">لسه ما ضفتش أي هدف — تقدر تضيف واحد دلوقتي أو تتخطى الخطوة دي وتضيفهم بعدين.</p>`;
}

function bindOnce() {
  if (el('onboarding-screen').dataset.bound) return;
  el('onboarding-screen').dataset.bound = '1';

  el('btn-onboarding-next-1').addEventListener('click', () => {
    if (!el('onboarding-start-date').value) return;
    showStep(2);
  });

  el('btn-onboarding-back-2').addEventListener('click', () => showStep(1));
  el('btn-onboarding-next-2').addEventListener('click', () => showStep(3));
  el('btn-onboarding-back-3').addEventListener('click', () => showStep(2));

  el('btn-onboarding-add-goal').addEventListener('click', () => {
    const name = el('onboarding-goal-name').value.trim();
    const points = parseInt(el('onboarding-goal-points').value, 10) || 10;
    if (!name) return;
    draftGoals.push({ name, points });
    el('onboarding-goal-name').value = '';
    el('onboarding-goal-points').value = '';
    renderDraftGoalsList();
  });

  el('onboarding-goals-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.onboarding-goal-chip__remove');
    if (!btn) return;
    draftGoals.splice(Number(btn.dataset.index), 1);
    renderDraftGoalsList();
  });

  el('btn-onboarding-finish').addEventListener('click', finish);
}

function finish() {
  const startDate = el('onboarding-start-date').value || toISODate(new Date());
  const weekStartDay = Number(document.querySelector('input[name="onboarding-week-start"]:checked')?.value ?? 6);

  el('onboarding-screen').classList.add('onboarding-screen--hidden');
  setTimeout(() => el('onboarding-screen').classList.add('hidden'), 400);

  if (onCompleteCallback) onCompleteCallback({ startDate, weekStartDay, goals: draftGoals });
}

/** بدء عرض المعالج. onComplete({startDate, weekStartDay, goals}) بينفّذ لما المستخدم يخلص */
export function runOnboardingWizard({ onComplete }) {
  onCompleteCallback = onComplete;
  draftGoals = [];
  currentStep = 1;

  el('onboarding-start-date').value = toISODate(new Date());
  el('onboarding-week-options').innerHTML = WEEK_START_OPTIONS.map(
    (opt, i) => `
      <label class="onboarding-radio">
        <input type="radio" name="onboarding-week-start" value="${opt.value}" ${i === 0 ? 'checked' : ''} />
        <span>${opt.label}</span>
      </label>`
  ).join('');

  renderDraftGoalsList();
  bindOnce();
  showStep(1);

  el('onboarding-screen').classList.remove('hidden');
  requestAnimationFrame(() => el('onboarding-screen').classList.remove('onboarding-screen--hidden'));
}