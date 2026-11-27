/* ==========================================================================
   Uparsistem · Dashboard Privado de Estadísticas
   Etapa 3: Autenticación con Supabase Auth + KPIs + Filtros + Chart.js
   Solo muestra estadísticas agregadas (sin exportación ni datos personales).
   ========================================================================== */

const PALETTE = {
  greenDark: '#114720',
  greenPrimary: '#1b6b2f',
  greenLime: '#78be20',
  orangePrimary: '#f97316',
  orangeSoft: '#fb923c',
  teal: '#0d9488',
  amber: '#eab308',
  slate: '#64748b'
};

let supabaseClient = null;
let allRecords = [];
const chartInstances = {};

document.addEventListener('DOMContentLoaded', async () => {
  supabaseClient = createSupabaseClient();

  bindLoginEvents();
  bindDashboardEvents();

  if (!supabaseClient) {
    showLoginFeedback('error', 'No se encontró la configuración de Supabase en config.js.');
    return;
  }

  // Verificar si ya existe una sesión iniciada
  const { data } = await supabaseClient.auth.getSession();
  if (data && data.session) {
    await enterDashboard();
  } else {
    showLoginScreen();
  }
});

function createSupabaseClient() {
  const cfg = window.SEMINARIO_CONFIG;
  if (!window.supabase || !cfg || !cfg.supabaseUrl || !cfg.supabasePublicKey) {
    return null;
  }
  const cleanUrl = cfg.supabaseUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  return window.supabase.createClient(cleanUrl, cfg.supabasePublicKey);
}

/* ==========================================================================
   Manejo de Sesión (Login / Logout)
   ========================================================================== */
function showLoginScreen() {
  allRecords = [];
  destroyAllCharts();

  const tbody = document.getElementById('registrantsTableBody');
  if (tbody) tbody.innerHTML = '';

  document.getElementById('loginSection').classList.remove('is-hidden');
  document.getElementById('dashboardSection').classList.add('is-hidden');
  document.getElementById('logoutBtnTop').classList.add('is-hidden');
}

async function enterDashboard() {
  document.getElementById('loginSection').classList.add('is-hidden');
  document.getElementById('dashboardSection').classList.remove('is-hidden');
  document.getElementById('logoutBtnTop').classList.remove('is-hidden');

  await loadAndRenderStatistics();
}

function showLoginFeedback(type, message) {
  const el = document.getElementById('loginFeedback');
  if (!el) return;
  el.className = `form-feedback is-visible is-${type}`;
  el.textContent = message;
}

function hideLoginFeedback() {
  const el = document.getElementById('loginFeedback');
  if (!el) return;
  el.className = 'form-feedback';
  el.textContent = '';
}

function showDashboardAlert(type, message) {
  const el = document.getElementById('dashboardAlert');
  if (!el) return;
  if (!message) {
    el.className = 'form-feedback';
    el.textContent = '';
    return;
  }
  el.className = `form-feedback is-visible is-${type}`;
  el.textContent = message;
}

function bindLoginEvents() {
  const form = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  if (!form || !loginBtn) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideLoginFeedback();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    document.getElementById('error-loginEmail').textContent = '';
    document.getElementById('error-loginPassword').textContent = '';

    let hasError = false;
    if (!email) {
      document.getElementById('error-loginEmail').textContent = 'Ingresa tu correo electrónico.';
      hasError = true;
    }
    if (!password) {
      document.getElementById('error-loginPassword').textContent = 'Ingresa tu contraseña.';
      hasError = true;
    }
    if (hasError || !supabaseClient) return;

    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error || !data.session) {
        showLoginFeedback('error', 'Correo o contraseña incorrectos. Verifica tus datos e intenta nuevamente.');
        return;
      }

      form.reset();
      await enterDashboard();
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      showLoginFeedback('error', 'No se pudo iniciar sesión. Revisa tu conexión a internet.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
    }
  });
}

function bindDashboardEvents() {
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const logoutBtnTop = document.getElementById('logoutBtnTop');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');

  const filterControls = [
    'filterSituacion',
    'filterCiudad',
    'filterCanal',
    'filterFechaDesde',
    'filterFechaHasta'
  ];

  filterControls.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', applyFiltersAndRender);
    }
  });

  const searchInput = document.getElementById('tableSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderRegistrantsTable(getFilteredByTopControls());
    });
  }

  bindExportEvents();

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      filterControls.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      if (searchInput) searchInput.value = '';
      applyFiltersAndRender();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const originalHtml = refreshBtn.innerHTML;
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Actualizando...';
      await loadAndRenderStatistics();
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = originalHtml;
    });
  }

  const handleLogout = async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    showLoginScreen();
  };

  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  if (logoutBtnTop) logoutBtnTop.addEventListener('click', handleLogout);
}

/* ==========================================================================
   Carga de datos desde Supabase (solo columnas estadísticas)
   ========================================================================== */
async function loadAndRenderStatistics() {
  if (!supabaseClient) return;
  showDashboardAlert(null, '');

  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData || !sessionData.session) {
    showLoginScreen();
    return;
  }

  const { data, error } = await supabaseClient
    .from('inscripciones')
    .select(
      'nombres, apellidos, tipo_documento, numero_documento, correo, celular, ciudad, situacion_actual, programa_institucion, como_se_entero, fecha_registro'
    )
    .order('fecha_registro', { ascending: false });

  if (error) {
    console.error('Error al consultar estadísticas:', error);
    showDashboardAlert('error', 'No fue posible cargar las estadísticas. Verifica tus permisos o conexión.');
    return;
  }

  allRecords = (data || []).map((row) => ({
    nombres: (row.nombres || '').trim(),
    apellidos: (row.apellidos || '').trim(),
    tipo_documento: row.tipo_documento || '',
    numero_documento: row.numero_documento || '',
    correo: (row.correo || '').trim(),
    celular: (row.celular || '').trim(),
    situacion_actual: row.situacion_actual || 'No especificado',
    ciudad: normalizeLabel(row.ciudad) || 'No especificada',
    como_se_entero: row.como_se_entero || 'No especificado',
    programa_institucion: normalizeLabel(row.programa_institucion) || 'No especificado',
    fecha_registro: row.fecha_registro || '',
    fecha_local: toLocalDateString(row.fecha_registro)
  }));

  populateCityFilter(allRecords);
  updateLastUpdatedLabel();
  applyFiltersAndRender();
}

function normalizeLabel(value) {
  if (!value || typeof value !== 'string') return '';
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function toLocalDateString(isoTimestamp) {
  if (!isoTimestamp) return '';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

function updateLastUpdatedLabel() {
  const el = document.getElementById('lastUpdatedText');
  if (!el) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  el.textContent = `Seminario "Tu imagen, tu oportunidad" · Última actualización: ${timeStr}`;
}

function populateCityFilter(records) {
  const select = document.getElementById('filterCiudad');
  if (!select) return;

  const previousValue = select.value;
  const cities = Array.from(new Set(records.map((r) => r.ciudad))).sort((a, b) =>
    a.localeCompare(b, 'es')
  );

  select.innerHTML = '<option value="">Todas las ciudades</option>';
  cities.forEach((city) => {
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    select.appendChild(option);
  });

  if (cities.includes(previousValue)) {
    select.value = previousValue;
  }
}

/* ==========================================================================
   Filtrado y recálculo de KPIs y Gráficos
   ========================================================================== */
function getFilteredByTopControls() {
  const situacion = document.getElementById('filterSituacion').value;
  const ciudad = document.getElementById('filterCiudad').value;
  const canal = document.getElementById('filterCanal').value;
  const desde = document.getElementById('filterFechaDesde').value;
  const hasta = document.getElementById('filterFechaHasta').value;

  return allRecords.filter((item) => {
    if (situacion && item.situacion_actual !== situacion) return false;
    if (ciudad && item.ciudad !== ciudad) return false;
    if (canal && item.como_se_entero !== canal) return false;
    if (desde && (!item.fecha_local || item.fecha_local < desde)) return false;
    if (hasta && (!item.fecha_local || item.fecha_local > hasta)) return false;
    return true;
  });
}

function applyFiltersAndRender() {
  const situacion = document.getElementById('filterSituacion').value;
  const ciudad = document.getElementById('filterCiudad').value;
  const canal = document.getElementById('filterCanal').value;
  const desde = document.getElementById('filterFechaDesde').value;
  const hasta = document.getElementById('filterFechaHasta').value;

  const filtered = getFilteredByTopControls();

  const hasActiveFilter = Boolean(situacion || ciudad || canal || desde || hasta);
  const statusEl = document.getElementById('filtersStatus');
  if (statusEl) {
    statusEl.textContent = hasActiveFilter
      ? `Mostrando ${filtered.length} de ${allRecords.length} inscritos (filtros activos)`
      : `Mostrando todos los registros (${allRecords.length})`;
  }

  renderKpis(filtered.length);
  renderAllCharts(filtered);
  renderRegistrantsTable(filtered);
}

function formatTimestampDisplay(isoTimestamp) {
  if (!isoTimestamp) return '-';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTableMatchingRecords(records) {
  const searchInput = document.getElementById('tableSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

  if (!query) return records;

  return records.filter((item) => {
    const fullText = [
      item.nombres,
      item.apellidos,
      item.tipo_documento,
      item.numero_documento,
      item.correo,
      item.celular,
      item.ciudad,
      item.situacion_actual,
      item.programa_institucion,
      item.como_se_entero
    ]
      .join(' ')
      .toLowerCase();
    return fullText.includes(query);
  });
}

function renderRegistrantsTable(records) {
  const tbody = document.getElementById('registrantsTableBody');
  const emptyState = document.getElementById('tableEmptyState');
  const countBadge = document.getElementById('tableCountBadge');
  if (!tbody || !emptyState || !countBadge) return;

  const matching = getTableMatchingRecords(records);

  countBadge.textContent =
    matching.length === 1 ? '1 registro' : `${matching.length} registros`;

  tbody.innerHTML = '';

  if (matching.length === 0) {
    emptyState.classList.remove('is-hidden');
    return;
  }

  emptyState.classList.add('is-hidden');

  matching.forEach((item, index) => {
    const tr = document.createElement('tr');

    const cells = [
      String(index + 1),
      `${item.nombres} ${item.apellidos}`.trim() || '-',
      `${item.tipo_documento} ${item.numero_documento}`.trim() || '-',
      item.correo || '-',
      item.celular || '-',
      item.ciudad || '-',
      null,
      item.programa_institucion || 'No especificado',
      item.como_se_entero || 'No especificado',
      formatTimestampDisplay(item.fecha_registro)
    ];

    cells.forEach((value, cellIndex) => {
      const td = document.createElement('td');
      if (cellIndex === 6) {
        const badge = document.createElement('span');
        badge.className =
          item.situacion_actual === 'Buscando empleo'
            ? 'table-badge table-badge--orange'
            : 'table-badge';
        badge.textContent = item.situacion_actual;
        td.appendChild(badge);
      } else {
        td.textContent = value;
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Exportación a Excel (.xlsx) y CSV (.csv)
   ========================================================================== */
function bindExportEvents() {
  const dropdown = document.getElementById('exportDropdown');
  const toggleBtn = document.getElementById('exportDropdownBtn');
  const menu = document.getElementById('exportMenu');
  const excelBtn = document.getElementById('exportExcelBtn');
  const csvBtn = document.getElementById('exportCsvBtn');

  if (!dropdown || !toggleBtn || !menu) return;

  const closeMenu = () => {
    menu.classList.add('is-hidden');
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isHidden = menu.classList.toggle('is-hidden');
    toggleBtn.setAttribute('aria-expanded', String(!isHidden));
  });

  document.addEventListener('click', (event) => {
    if (!dropdown.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  if (excelBtn) {
    excelBtn.addEventListener('click', () => {
      closeMenu();
      exportRecords('xlsx');
    });
  }

  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      closeMenu();
      exportRecords('csv');
    });
  }
}

function buildExportRows(records) {
  return records.map((item, idx) => ({
    '#': idx + 1,
    Nombres: item.nombres || '',
    Apellidos: item.apellidos || '',
    'Tipo de documento': item.tipo_documento || '',
    'Número de documento': String(item.numero_documento || ''),
    'Correo electrónico': item.correo || '',
    Celular: String(item.celular || ''),
    Ciudad: item.ciudad || '',
    'Situación actual': item.situacion_actual || '',
    'Programa o institución': item.programa_institucion || 'No especificado',
    '¿Cómo te enteraste?': item.como_se_entero || 'No especificado',
    'Fecha de registro': formatTimestampDisplay(item.fecha_registro)
  }));
}

function getExportFileBaseName() {
  const today = toLocalDateString(new Date().toISOString()) || 'export';
  return `inscritos_seminario_2026_${today}`;
}

function exportRecords(format) {
  showDashboardAlert(null, '');
  const records = getTableMatchingRecords(getFilteredByTopControls());

  if (records.length === 0) {
    showDashboardAlert('info', 'No hay registros visibles para exportar con los filtros actuales.');
    return;
  }

  const rows = buildExportRows(records);
  const fileBase = getExportFileBaseName();

  if (format === 'csv') {
    downloadCsvFile(rows, `${fileBase}.csv`);
    return;
  }

  if (window.XLSX) {
    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 5 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 20 },
      { wch: 28 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 28 },
      { wch: 18 },
      { wch: 20 }
    ];
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Inscritos');
    window.XLSX.writeFile(workbook, `${fileBase}.xlsx`);
  } else {
    downloadExcelFallback(rows, `${fileBase}.xls`);
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadCsvFile(rows, filename) {
  const headers = Object.keys(rows[0]);
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n\r;]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
  ];

  // BOM UTF-8 para que Excel muestre correctamente tildes y eñes
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadExcelFallback(rows, filename) {
  const headers = Object.keys(rows[0]);
  const headerHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyHtml = rows
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join('')}</tr>`
    )
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`;
  const blob = new Blob(['\uFEFF' + html], {
    type: 'application/vnd.ms-excel;charset=utf-8;'
  });
  triggerBlobDownload(blob, filename);
}

function renderKpis(count) {
  const totalCupos = (window.SEMINARIO_CONFIG && window.SEMINARIO_CONFIG.totalCupos) || 100;
  const available = Math.max(0, totalCupos - count);
  const rawPct = totalCupos > 0 ? (count / totalCupos) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, rawPct));
  const formattedPct = Number.isInteger(rawPct) ? `${rawPct}%` : `${rawPct.toFixed(1)}%`;

  document.getElementById('kpiTotal').textContent = String(count);
  document.getElementById('kpiAvailable').textContent = String(available);
  document.getElementById('kpiOccupancy').textContent = formattedPct;
  document.getElementById('occupancyBar').style.width = `${clampedPct}%`;

  const noteEl = document.getElementById('kpiTotalNote');
  if (noteEl) {
    noteEl.textContent =
      count >= totalCupos ? 'Cupo completo alcanzado' : `De ${totalCupos} cupos habilitados`;
  }
}

/* ==========================================================================
   Construcción de los 5 gráficos con Chart.js
   ========================================================================== */
function destroyAllCharts() {
  Object.keys(chartInstances).forEach((key) => {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  });
}

function toggleEmptyState(canvasId, isEmpty) {
  const canvas = document.getElementById(canvasId);
  const emptyBox = document.getElementById(`empty-${canvasId}`);
  if (canvas) canvas.classList.toggle('is-hidden', isEmpty);
  if (emptyBox) emptyBox.classList.toggle('is-hidden', !isEmpty);
}

function groupAndCount(records, key, sortDesc = true) {
  const counts = {};
  records.forEach((item) => {
    const label = item[key] || 'No especificado';
    counts[label] = (counts[label] || 0) + 1;
  });

  const entries = Object.entries(counts);
  if (sortDesc) {
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  }
  return entries;
}

function renderAllCharts(records) {
  renderSituacionChart(records);
  renderCanalChart(records);
  renderCiudadChart(records);
  renderProgramaChart(records);
  renderTiempoChart(records);
}

function renderSituacionChart(records) {
  const canvasId = 'chartSituacion';
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

  if (records.length === 0) {
    toggleEmptyState(canvasId, true);
    return;
  }
  toggleEmptyState(canvasId, false);

  const orderedCategories = ['Estudiante', 'Egresado', 'Empleado', 'Buscando empleo'];
  const countsMap = {};
  orderedCategories.forEach((cat) => {
    countsMap[cat] = 0;
  });

  records.forEach((r) => {
    countsMap[r.situacion_actual] = (countsMap[r.situacion_actual] || 0) + 1;
  });

  const labels = Object.keys(countsMap);
  const values = Object.values(countsMap);

  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Inscritos',
          data: values,
          backgroundColor: [
            PALETTE.greenPrimary,
            PALETTE.greenLime,
            PALETTE.orangePrimary,
            PALETTE.greenDark
          ],
          borderRadius: 8,
          maxBarThickness: 54
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderCanalChart(records) {
  const canvasId = 'chartCanal';
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

  if (records.length === 0) {
    toggleEmptyState(canvasId, true);
    return;
  }
  toggleEmptyState(canvasId, false);

  const entries = groupAndCount(records, 'como_se_entero', true);
  const labels = entries.map((e) => e[0]);
  const values = entries.map((e) => e[1]);

  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            PALETTE.greenPrimary,
            PALETTE.orangePrimary,
            PALETTE.greenLime,
            PALETTE.teal,
            PALETTE.orangeSoft,
            PALETTE.slate
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 14, padding: 14 }
        }
      }
    }
  });
}

function renderCiudadChart(records) {
  const canvasId = 'chartCiudad';
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

  if (records.length === 0) {
    toggleEmptyState(canvasId, true);
    return;
  }
  toggleEmptyState(canvasId, false);

  const entries = groupAndCount(records, 'ciudad', true);
  const labels = entries.map((e) => e[0]);
  const values = entries.map((e) => e[1]);

  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Inscritos',
          data: values,
          backgroundColor: PALETTE.greenPrimary,
          borderRadius: 6,
          maxBarThickness: 28
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderProgramaChart(records) {
  const canvasId = 'chartPrograma';
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

  if (records.length === 0) {
    toggleEmptyState(canvasId, true);
    return;
  }
  toggleEmptyState(canvasId, false);

  const entries = groupAndCount(records, 'programa_institucion', true).slice(0, 10);
  const labels = entries.map((e) => e[0]);
  const values = entries.map((e) => e[1]);

  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Inscritos',
          data: values,
          backgroundColor: PALETTE.orangePrimary,
          borderRadius: 6,
          maxBarThickness: 28
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderTiempoChart(records) {
  const canvasId = 'chartTiempo';
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

  const validRecords = records.filter((r) => Boolean(r.fecha_local));
  if (validRecords.length === 0) {
    toggleEmptyState(canvasId, true);
    return;
  }
  toggleEmptyState(canvasId, false);

  const byDay = {};
  validRecords.forEach((r) => {
    byDay[r.fecha_local] = (byDay[r.fecha_local] || 0) + 1;
  });

  const sortedDates = Object.keys(byDay).sort();
  const labels = sortedDates.map(formatDateDisplay);
  const values = sortedDates.map((d) => byDay[d]);

  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Inscripciones por día',
          data: values,
          borderColor: PALETTE.greenPrimary,
          backgroundColor: 'rgba(120, 190, 32, 0.2)',
          pointBackgroundColor: PALETTE.orangePrimary,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          tension: 0.25,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { grid: { display: false } }
      }
    }
  });
}
