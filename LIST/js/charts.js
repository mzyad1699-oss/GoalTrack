import { DAY_NAMES_AR } from './utils.js';

// ============================================================
// وحدة الرسوم البيانية — Chart.js
// في هذه المرحلة: رسم بياني واحد بسيط لنقاط الأسبوع لكل يوم
// (سيتم إضافة باقي الرسوم: Pie / Radar / مقارنة الأسابيع... في مرحلة الإحصائيات)
// ============================================================

let weeklyPointsChartInstance = null;

export function renderWeeklyPointsChart(canvasId, pointsPerDay) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;

  if (weeklyPointsChartInstance) {
    weeklyPointsChartInstance.destroy();
  }

  weeklyPointsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: DAY_NAMES_AR,
      datasets: [
        {
          label: 'النقاط المحققة',
          data: pointsPerDay,
          backgroundColor: '#2DD4BF',
          borderRadius: 8,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8B96B3', font: { family: 'IBM Plex Sans Arabic' } } },
        y: { beginAtZero: true, grid: { color: 'rgba(139,150,179,0.15)' }, ticks: { color: '#8B96B3' } },
      },
    },
  });
}
