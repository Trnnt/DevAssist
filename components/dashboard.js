/**
 * Dashboard Component
 * Renders the analytics dashboard with Chart.js charts and stat cards.
 */

import { escapeHTML, animateCountUp } from '../services/utils.js';

/** Chart instances (stored to allow destruction on re-render) */
let langChart = null;
let starsChart = null;

/** Language color palette for charts */
const CHART_COLORS = [
  '#58a6ff', '#bc8cff', '#f78166', '#3fb950', '#d29922',
  '#79c0ff', '#ffa657', '#ff7b72', '#56d364', '#e3b341',
];

/**
 * Calculates account age from creation date.
 * @param {string} createdAt
 * @returns {string} Human-readable age
 */
function calcAccountAge(createdAt) {
  if (!createdAt) return 'Unknown';
  const created = new Date(createdAt);
  const now = new Date();
  const years = now.getFullYear() - created.getFullYear();
  const months = now.getMonth() - created.getMonth();
  const totalMonths = years * 12 + months;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return `${m} month${m !== 1 ? 's' : ''}`;
  if (m === 0) return `${y} year${y !== 1 ? 's' : ''}`;
  return `${y}y ${m}m`;
}

/**
 * Calculates language usage statistics from repos.
 * @param {Array} repos
 * @returns {Object} language → count map, sorted by count desc
 */
function calcLanguageStats(repos) {
  const counts = {};
  repos.forEach((r) => {
    if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1])
  );
}

/**
 * Main dashboard render function.
 * @param {Object} user - GitHub user profile
 * @param {Array} repos - Array of user repositories
 * @param {HTMLElement} container - Target DOM element
 */
export function renderDashboard(user, repos, container) {
  // Destroy existing charts to prevent memory leaks and clear references
  if (langChart) {
    langChart.destroy();
    langChart = null;
  }
  if (starsChart) {
    starsChart.destroy();
    starsChart = null;
  }

  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
  const langStats = calcLanguageStats(repos);
  const topLangs = Object.entries(langStats).slice(0, 5);
  const topLang = topLangs[0]?.[0] || 'N/A';
  const accountAge = calcAccountAge(user.created_at);

  const totalLangCount = topLangs.reduce((sum, [, count]) => sum + count, 0);
  const topLangPct = totalLangCount > 0 ? ((topLangs[0][1] / totalLangCount) * 100).toFixed(1) : '0.0';
  const initialLangLabel = topLang !== 'N/A' ? topLang : '';
  const initialLangPct = topLang !== 'N/A' ? `${topLangPct}%` : '';

  const topReposByStars = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10);

  const safeTopLang = escapeHTML(topLang);
  const safeAccountAge = escapeHTML(accountAge);

  container.innerHTML = `
    <div class="dashboard">
      <!-- Premium KPI 2x2 Grid -->
      <div class="kpi-bar">
        <div class="kpi-item" title="Public Repositories">
          <div class="kpi-top-row">
            <span class="kpi-label">Repos</span>
            <svg viewBox="0 0 24 24" class="kpi-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <span class="kpi-value count-up-stat" data-target="${repos.length}">0</span>
        </div>
        <div class="kpi-item" title="Total Stars Earned">
          <div class="kpi-top-row">
            <span class="kpi-label">Stars</span>
            <svg viewBox="0 0 24 24" class="kpi-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>
          <span class="kpi-value count-up-stat" data-target="${totalStars}">0</span>
        </div>
        <div class="kpi-item" title="Total Forks Across All Repos">
          <div class="kpi-top-row">
            <span class="kpi-label">Forks</span>
            <svg viewBox="0 0 24 24" class="kpi-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"></circle>
              <circle cx="6" cy="6" r="3"></circle>
              <circle cx="6" cy="18" r="3"></circle>
              <path d="M18 15V9a4 4 0 0 0-4-4H9"></path>
              <line x1="6" y1="9" x2="6" y2="15"></line>
            </svg>
          </div>
          <span class="kpi-value count-up-stat" data-target="${totalForks}">0</span>
        </div>
        <div class="kpi-item" title="GitHub Account Age">
          <div class="kpi-top-row">
            <span class="kpi-label">Account Age</span>
            <svg viewBox="0 0 24 24" class="kpi-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <span class="kpi-value" style="font-size:15px">${safeAccountAge}</span>
        </div>
      </div>

      <!-- Most Used Language Badge -->
      ${topLang !== 'N/A' ? `
      <div class="top-lang-badge" style="--badge-lang-color: ${CHART_COLORS[0]}">
        <span class="badge-label">Primary Language</span>
        <span class="badge-lang-indicator">
          <span class="badge-lang-dot"></span>
          <span class="badge-value">${safeTopLang}</span>
        </span>
        <span class="badge-count">${Number(langStats[topLang])} repos</span>
      </div>` : ''}

      <!-- Charts -->
      <div class="chart-section">
        <h3 class="chart-title">Language Distribution</h3>
        <div class="chart-wrapper chart-donut-wrapper">
          <canvas id="lang-chart" aria-label="Language distribution donut chart"></canvas>
          <div class="chart-center-label">
            <div class="center-label-lang">${escapeHTML(initialLangLabel)}</div>
            <div class="center-label-pct">${initialLangPct}</div>
          </div>
        </div>
        <div id="lang-chart-legend" class="chart-legend-container"></div>
      </div>

      ${topReposByStars.length > 0 ? `
      <div class="chart-section">
        <h3 class="chart-title">Top Repos by Stars</h3>
        <div class="chart-wrapper chart-bar-wrapper">
          <canvas id="stars-chart" aria-label="Top repos by stars bar chart"></canvas>
        </div>
      </div>` : ''}

      <!-- Export Button -->
      <div class="dashboard-actions">
        <button class="export-btn" id="export-pdf-btn" title="Export profile as PDF">
          <svg viewBox="0 0 16 16" class="btn-icon"><path fill="currentColor" d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/><path fill="currentColor" d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/></svg>
          Export PDF
        </button>
      </div>
    </div>
  `;

  // Render charts & trigger count up after DOM is ready
  requestAnimationFrame(() => {
    _renderLangChart(topLangs);
    _renderStarsChart(topReposByStars);
    _attachDashboardEvents(user, repos);

    // Trigger count up animations
    container.querySelectorAll('.count-up-stat').forEach((el) => {
      const targetVal = parseInt(el.getAttribute('data-target'), 10);
      if (!isNaN(targetVal)) {
        animateCountUp(el, targetVal, 250);
      }
    });
  });
}

/**
 * Renders the language distribution doughnut chart with HTML legend.
 */
function _renderLangChart(topLangs) {
  const canvas = document.getElementById('lang-chart');
  const legendContainer = document.getElementById('lang-chart-legend');
  if (!canvas || !window.Chart || topLangs.length === 0) return;

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const centerLangEl = canvas.parentElement.querySelector('.center-label-lang');
  const centerPctEl = canvas.parentElement.querySelector('.center-label-pct');

  // Calculate percentages and generate custom HTML legend below chart
  const totalLangCount = topLangs.reduce((sum, [, count]) => sum + count, 0);
  if (legendContainer) {
    legendContainer.innerHTML = `
      <div class="custom-chart-legend">
        ${topLangs.map(([lang, count], index) => {
          const pct = ((count / totalLangCount) * 100).toFixed(1);
          return `
            <div class="legend-item" data-index="${index}">
              <span class="legend-color-box" style="background:${CHART_COLORS[index]}"></span>
              <span class="legend-label">${escapeHTML(lang)}</span>
              <span class="legend-pct">${pct}%</span>
              <span class="legend-count">(${count} repo${count > 1 ? 's' : ''})</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  const legendWrapper = legendContainer ? legendContainer.querySelector('.custom-chart-legend') : null;
  const legendItems = legendContainer ? legendContainer.querySelectorAll('.legend-item') : [];

  function highlightLegendItem(index) {
    if (!legendWrapper) return;
    legendWrapper.classList.add('has-active');
    legendItems.forEach((item, idx) => {
      if (idx === index) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function clearLegendHighlight() {
    if (!legendWrapper) return;
    legendWrapper.classList.remove('has-active');
    legendItems.forEach((item) => {
      item.classList.remove('active');
    });
  }

  let lastHoveredIndex = null;

  langChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: topLangs.map(([lang]) => lang),
      datasets: [{
        data: topLangs.map(([, count]) => count),
        backgroundColor: CHART_COLORS.slice(0, topLangs.length),
        borderColor: isDark ? '#161b22' : '#ffffff',
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '70%',
      interaction: {
        mode: 'nearest',
        intersect: true
      },
      onHover: (event, activeElements) => {
        if (activeElements && activeElements.length > 0) {
          const index = activeElements[0].index;
          if (lastHoveredIndex === index) return;
          lastHoveredIndex = index;

          const [lang, count] = topLangs[index];
          const pct = ((count / totalLangCount) * 100).toFixed(1);
          if (centerLangEl) centerLangEl.textContent = lang;
          if (centerPctEl) centerPctEl.textContent = `${pct}%`;
          highlightLegendItem(index);
        } else {
          if (lastHoveredIndex === null) return;
          lastHoveredIndex = null;

          // Revert to primary/top language
          const defaultLang = topLangs[0]?.[0] || 'N/A';
          const defaultCount = topLangs[0]?.[1] || 0;
          const defaultPct = totalLangCount > 0 ? ((defaultCount / totalLangCount) * 100).toFixed(1) : '0.0';
          if (centerLangEl) centerLangEl.textContent = defaultLang !== 'N/A' ? defaultLang : '';
          if (centerPctEl) centerPctEl.textContent = defaultLang !== 'N/A' ? `${defaultPct}%` : '';
          clearLegendHighlight();
        }
      },
      animation: {
        duration: 600,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { display: false }, // Custom legend used instead
        tooltip: { enabled: false }, // Center label handles hover info
      },
    },
  });

  // Attach mouse events to HTML legend items for bidirectional hover integration
  legendItems.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      const index = parseInt(item.getAttribute('data-index'), 10);
      if (isNaN(index)) return;

      // Avoid redundant triggers
      if (lastHoveredIndex === index) return;
      lastHoveredIndex = index;

      // Update center text
      const [lang, count] = topLangs[index];
      const pct = ((count / totalLangCount) * 100).toFixed(1);
      if (centerLangEl) centerLangEl.textContent = lang;
      if (centerPctEl) centerPctEl.textContent = `${pct}%`;

      // Highlight legend
      highlightLegendItem(index);

      // Highlight slice in chart
      if (langChart) {
        langChart.setActiveElements([{ datasetIndex: 0, index }]);
        langChart.update();
      }
    });

    item.addEventListener('mouseleave', () => {
      if (lastHoveredIndex === null) return;
      lastHoveredIndex = null;

      // Revert center text
      const defaultLang = topLangs[0]?.[0] || 'N/A';
      const defaultCount = topLangs[0]?.[1] || 0;
      const defaultPct = totalLangCount > 0 ? ((defaultCount / totalLangCount) * 100).toFixed(1) : '0.0';
      if (centerLangEl) centerLangEl.textContent = defaultLang !== 'N/A' ? defaultLang : '';
      if (centerPctEl) centerPctEl.textContent = defaultLang !== 'N/A' ? `${defaultPct}%` : '';

      // Clear legend highlights
      clearLegendHighlight();

      // Clear chart highlights
      if (langChart) {
        langChart.setActiveElements([]);
        langChart.update();
      }
    });
  });
}

/**
 * Renders the top repos by stars horizontal bar chart.
 */
function _renderStarsChart(topRepos) {
  const canvas = document.getElementById('stars-chart');
  if (!canvas || !window.Chart || topRepos.length === 0) return;

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#8b949e' : '#57606a';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // Sanitize labels to prevent scripting in chart texts
  const safeLabels = topRepos.map((r) => {
    const name = escapeHTML(r.name);
    return name.length > 18 ? name.slice(0, 15) + '…' : name;
  });

  // Custom inline plugin to draw value labels at the end of each bar
  const barLabelsPlugin = {
    id: 'barLabels',
    afterDatasetsDraw(chart) {
      const { ctx, data, chartArea: { right } } = chart;
      ctx.save();
      ctx.fillStyle = textColor;
      ctx.font = '10px Inter, sans-serif';
      ctx.textBaseline = 'middle';

      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        const realVal = topRepos[index].stargazers_count;
        const xPos = bar.x + 6;
        const yPos = bar.y;
        if (xPos < right) {
          ctx.fillText(realVal.toLocaleString(), xPos, yPos);
        }
      });
      ctx.restore();
    }
  };

  const maxStars = Math.max(...topRepos.map((r) => r.stargazers_count), 1);

  starsChart = new Chart(canvas, {
    type: 'bar',
    plugins: [barLabelsPlugin],
    data: {
      labels: safeLabels,
      datasets: [{
        label: 'Stars',
        data: topRepos.map((r) => Math.max(r.stargazers_count, maxStars * 0.012)),
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return '#58a6ffcc';
          const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          gradient.addColorStop(0, '#58a6ff');
          gradient.addColorStop(1, '#58a6ff20');
          return gradient;
        },
        borderColor: '#58a6ff',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1f242c' : '#ffffff',
          titleColor: isDark ? '#ffffff' : '#1f242c',
          bodyColor: isDark ? '#c9d1d9' : '#57606a',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label: (ctx) => {
              const realVal = topRepos[ctx.dataIndex].stargazers_count;
              return ` ${realVal.toLocaleString()} stars`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 10, family: "'Inter', sans-serif" } },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { size: 11, family: "'Inter', sans-serif" },
          },
        },
      },
    },
  });
}

/**
 * Attaches event listeners for dashboard actions (e.g., export PDF).
 */
function _attachDashboardEvents(user, repos) {
  const exportBtn = document.getElementById('export-pdf-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Preparing...';
      setTimeout(() => {
        window.print();
        exportBtn.disabled = false;
        exportBtn.innerHTML = `<svg viewBox="0 0 16 16" class="btn-icon"><path fill="currentColor" d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/><path fill="currentColor" d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/></svg>Export PDF`;
      }, 300);
    });
  }
}

/**
 * Returns chart data for external use (e.g., AI analysis).
 * @param {Array} repos
 * @returns {Object} Language stats and top repos
 */
export function getDashboardData(repos) {
  const langStats = calcLanguageStats(repos);
  const topLanguages = Object.keys(langStats).slice(0, 5);
  const topRepos = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 10);
  return { langStats, topLanguages, topRepos };
}
