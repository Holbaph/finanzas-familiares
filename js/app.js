// app.js — vistas, renderizado y manejo de eventos. Sin dependencias externas.

// Fix del bug clásico de iOS Safari: 100vh/100dvh no siempre refleja el alto real
// visible (la barra de herramientas puede sumarse/restarse de forma inconsistente),
// lo que deja huecos bajo los elementos "fixed" y desalinea los toques táctiles
// respecto de lo que se ve en pantalla. Medimos el alto real con VisualViewport.
function fixAppHeight() {
  const h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  document.documentElement.style.setProperty('--app-height', h + 'px');
}
fixAppHeight();
window.addEventListener('resize', fixAppHeight);
window.addEventListener('orientationchange', fixAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fixAppHeight);
  window.visualViewport.addEventListener('scroll', fixAppHeight);
}

let currentMonth = Utils.monthKey();
let activeView = 'resumen';
let gastoTipoActivo = 'consumo';

const ICONOS_DEUDA = [
  '💧', '⚡', '📶', '📱', '🎬', '📺', '🐷', '🚗', '🎮', '🛏️',
  '🐶', '🏦', '💳', '🎓', '🚙', '🏠', '👕', '🧊', '🧳', '✈️',
  '🍔', '☕', '🎁', '💊', '📦', '💰', '📌',
];

function protegida() {
  return Lock.isEnabled() || Biometric.isEnabled();
}

function mostrarPantallaBloqueo() {
  Lock.showOverlay();
  document.getElementById('lockPinSection').style.display = Lock.isEnabled() ? '' : 'none';
  document.getElementById('btnUsarFaceId').style.display = Biometric.isEnabled() ? '' : 'none';
  document.getElementById('lockSubtitle').textContent = Lock.isEnabled() && Biometric.isEnabled()
    ? 'Usa Face ID / Touch ID o tu PIN para continuar'
    : Biometric.isEnabled() ? 'Usa Face ID / Touch ID para continuar' : 'Ingresa tu PIN para continuar';
  if (Biometric.isEnabled()) intentarBiometrico();
}

function boot() {
  applyTheme(DB.getMeta().tema || 'auto');
  wireLock();
  if (protegida()) {
    mostrarPantallaBloqueo();
  } else {
    document.documentElement.classList.remove('locked-boot');
    init();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && protegida()) mostrarPantallaBloqueo();
  });
}

let appStarted = false;
function init() {
  if (appStarted) { renderAll(); return; }
  appStarted = true;
  DB.seedIfEmpty();
  DB.migrar();
  currentMonth = DB.getMeta().mesActual || Utils.monthKey();
  DB.ensureMes(currentMonth);
  populateCategoriaFilter();
  wireNav();
  wireMonthSwitch();
  wireFab();
  wireSheetOverlay();
  wireAjustes();
  wireGastoTipoSegmented();
  wireThemeGrid();
  renderAll();
}

function renderAll() {
  document.getElementById('mesLabel').textContent = Utils.monthLabel(currentMonth);
  renderResumen();
  renderDeudas();
  renderIngresos();
  renderGastos();
  updateFabVisibility();
}

// ---------- Navegación ----------
function wireNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeView = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      document.getElementById('view-' + activeView).classList.remove('hidden');
      updateFabVisibility();
    });
  });
}

function updateFabVisibility() {
  const fab = document.getElementById('fab');
  if (activeView === 'deudas' || activeView === 'ingresos' || activeView === 'gastos') {
    fab.classList.remove('hidden');
  } else {
    fab.classList.add('hidden');
  }
}

function wireMonthSwitch() {
  document.getElementById('mesPrev').addEventListener('click', () => changeMonth(-1));
  document.getElementById('mesNext').addEventListener('click', () => changeMonth(1));
}
function changeMonth(delta) {
  currentMonth = Utils.shiftMonth(currentMonth, delta);
  DB.ensureMes(currentMonth);
  DB.setMeta({ mesActual: currentMonth });
  renderAll();
}

function wireFab() {
  document.getElementById('fab').addEventListener('click', () => {
    if (activeView === 'deudas') openDeudaForm();
    else if (activeView === 'ingresos') openIngresoForm();
    else if (activeView === 'gastos') openGastoForm(null, gastoTipoActivo);
  });
}

function wireGastoTipoSegmented() {
  const seg = document.getElementById('gastoTipoSegmented');
  seg.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      gastoTipoActivo = b.dataset.tipo;
      document.getElementById('consumoPanel').classList.toggle('hidden', gastoTipoActivo !== 'consumo');
      document.getElementById('rendirPanel').classList.toggle('hidden', gastoTipoActivo !== 'rendir');
    });
  });
}

// ---------- Sheet genérico ----------
function wireSheetOverlay() {
  const overlay = document.getElementById('sheetOverlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });
}
function openSheet(html) {
  document.getElementById('sheetContent').innerHTML = html;
  document.getElementById('sheetOverlay').classList.remove('hidden');
}
function closeSheet() {
  document.getElementById('sheetOverlay').classList.add('hidden');
  document.getElementById('sheetContent').innerHTML = '';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ---------- RESUMEN ----------
function renderResumen() {
  const ingresos = DB.getIngresosDeMes(currentMonth);
  const pagos = DB.getPagosDeMes(currentMonth);
  const deudas = DB.getDeudas();

  const ingresosTotal = ingresos.reduce((s, i) => s + Number(i.monto), 0);
  const gastosTotal = pagos.reduce((s, p) => s + Number(p.gasto), 0);
  const pagadoTotal = pagos.filter(p => p.pagado).reduce((s, p) => s + Number(p.gasto), 0);
  const pendienteTotal = gastosTotal - pagadoTotal;
  const saldoInicial = DB.getSaldoInicial(currentMonth);
  const balance = saldoInicial + ingresosTotal - gastosTotal;

  document.getElementById('kpiIngresos').textContent = Utils.formatCLP(ingresosTotal);
  document.getElementById('kpiGastos').textContent = Utils.formatCLP(gastosTotal);
  document.getElementById('kpiBalance').textContent = Utils.formatCLP(balance);
  document.getElementById('kpiBalance').style.color = balance >= 0 ? 'var(--accent)' : 'var(--red)';
  document.getElementById('kpiPendiente').textContent = Utils.formatCLP(pendienteTotal);
  const balanceSub = document.getElementById('kpiBalanceSub');
  if (saldoInicial > 0) {
    balanceSub.textContent = `Incluye ${Utils.formatCLP(saldoInicial)} de ${Utils.monthLabel(Utils.shiftMonth(currentMonth, -1))}`;
    balanceSub.classList.remove('hidden');
  } else {
    balanceSub.classList.add('hidden');
  }

  const pct = gastosTotal > 0 ? Math.round((pagadoTotal / gastosTotal) * 100) : 100;
  document.getElementById('progresoFill').style.width = pct + '%';
  document.getElementById('progresoTexto').textContent = `${pct}% · ${Utils.formatCLP(pagadoTotal)} de ${Utils.formatCLP(gastosTotal)}`;

  // Por categoría
  const porCategoria = {};
  pagos.forEach(p => {
    const deuda = deudas.find(d => d.id === p.deudaId);
    if (!deuda) return;
    const cat = deuda.categoria || 'Otros';
    if (!porCategoria[cat]) porCategoria[cat] = { total: 0, pagado: 0 };
    porCategoria[cat].total += Number(p.gasto);
    if (p.pagado) porCategoria[cat].pagado += Number(p.gasto);
  });
  const catList = document.getElementById('categoriaList');
  const catKeys = Object.keys(porCategoria).sort((a, b) => porCategoria[b].total - porCategoria[a].total);
  if (catKeys.length === 0) {
    catList.innerHTML = '<div class="empty-state">Sin datos este mes</div>';
  } else {
    catList.innerHTML = catKeys.map(cat => {
      const c = porCategoria[cat];
      const pct = c.total > 0 ? Math.round((c.pagado / c.total) * 100) : 0;
      return `<div class="categoria-row">
        <div class="categoria-row-top"><strong>${escapeHtml(cat)}</strong><span>${Utils.formatCLP(c.total)}</span></div>
        <div class="categoria-bar-track"><div class="categoria-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  // Rendiciones a la empresa (no filtra por mes: son un saldo pendiente vivo)
  const rendirGastos = DB.getGastos().filter(g => g.tipo === 'rendir');
  const rendirPendiente = rendirGastos.filter(g => g.estado === 'pendiente').reduce((s, g) => s + Number(g.monto), 0);
  const rendirRendido = rendirGastos.filter(g => g.estado === 'rendido').reduce((s, g) => s + Number(g.monto), 0);
  const rendicionesEl = document.getElementById('rendicionesResumen');
  if (rendirPendiente === 0 && rendirRendido === 0) {
    rendicionesEl.innerHTML = '<div class="empty-state">Sin gastos por rendir pendientes.</div>';
  } else {
    rendicionesEl.innerHTML = `
      <div class="categoria-row">
        <div class="categoria-row-top"><strong>Falta rendir a la empresa</strong><span>${Utils.formatCLP(rendirPendiente)}</span></div>
      </div>
      <div class="categoria-row">
        <div class="categoria-row-top"><strong>Rendido, por cobrar</strong><span>${Utils.formatCLP(rendirRendido)}</span></div>
      </div>
    `;
  }

  // Pendientes
  const pendientesList = document.getElementById('pendientesList');
  const pendientes = pagos.filter(p => !p.pagado)
    .map(p => ({ pago: p, deuda: deudas.find(d => d.id === p.deudaId) }))
    .filter(x => x.deuda)
    .sort((a, b) => b.pago.gasto - a.pago.gasto);
  if (pendientes.length === 0) {
    pendientesList.innerHTML = '<div class="empty-state">Todo pagado este mes 🎉</div>';
  } else {
    pendientesList.innerHTML = pendientes.map(({ pago, deuda }) => deudaCardHtml(deuda, pago)).join('');
  }
  attachDeudaCardEvents(pendientesList);

  renderRecordatorioCierre();
  renderCierreMes();
}

// ---------- Cierre de mes ----------
function renderRecordatorioCierre() {
  const banner = document.getElementById('recordatorioCierre');
  const hoy = new Date();
  if (hoy.getDate() > 5) { banner.classList.add('hidden'); return; }
  const mesAnterior = Utils.shiftMonth(Utils.monthKey(hoy), -1);
  if (DB.getCierre(mesAnterior)) { banner.classList.add('hidden'); return; }
  banner.textContent = `💡 Estás entre los primeros días del mes: no olvides cerrar ${Utils.monthLabel(mesAnterior)} para trasladar tu saldo.`;
  banner.classList.remove('hidden');
}

function renderCierreMes() {
  const cierre = DB.getCierre(currentMonth);
  const el = document.getElementById('cierreMesBlock');
  const mesSiguiente = Utils.monthLabel(Utils.shiftMonth(currentMonth, 1));

  if (cierre) {
    el.innerHTML = `
      <div class="cierre-card">
        <span class="cierre-cerrado-badge">✓ Cerrado el ${formatFechaCorta(cierre.fechaCierre.slice(0, 10))}</span>
        <p>Saldo trasladado a ${mesSiguiente}: <strong>${Utils.formatCLP(Math.max(0, cierre.saldoFinal))}</strong>${cierre.saldoFinal < 0 ? ' (el mes cerró en negativo, así que el siguiente parte en $0)' : ''}</p>
        <div class="sheet-actions" style="margin-top:0">
          <button class="btn btn-secondary full" id="btnRecalcularCierre">Recalcular cierre</button>
          <button class="btn btn-text full" id="btnReabrirCierre">Deshacer cierre</button>
        </div>
      </div>`;
    document.getElementById('btnRecalcularCierre').addEventListener('click', () => {
      DB.cerrarMes(currentMonth);
      renderAll();
      showToast('Cierre recalculado');
    });
    document.getElementById('btnReabrirCierre').addEventListener('click', () => {
      if (confirm(`¿Deshacer el cierre de ${Utils.monthLabel(currentMonth)}? ${mesSiguiente} volverá a partir en $0.`)) {
        DB.reabrirMes(currentMonth);
        renderAll();
        showToast('Cierre deshecho');
      }
    });
  } else {
    el.innerHTML = `
      <div class="cierre-card">
        <p>Al cerrar ${Utils.monthLabel(currentMonth)}, lo que sobre (o $0 si no sobra) pasa como saldo inicial de ${mesSiguiente}.</p>
        <button class="btn btn-primary full" id="btnCerrarMes">Cerrar ${Utils.monthLabel(currentMonth)}</button>
      </div>`;
    document.getElementById('btnCerrarMes').addEventListener('click', () => {
      if (confirm(`¿Cerrar ${Utils.monthLabel(currentMonth)}? Podrás deshacerlo después si es necesario.`)) {
        DB.cerrarMes(currentMonth);
        renderAll();
        showToast('Mes cerrado');
      }
    });
  }
}

// ---------- DEUDAS ----------
function populateCategoriaFilter() {
  const sel = document.getElementById('filtroCategoria');
  sel.addEventListener('change', renderDeudas);
  document.getElementById('btnVerArchivadas').addEventListener('click', openArchivadasSheet);
  refreshCategoriaFilterOptions();
}

function refreshCategoriaFilterOptions() {
  const sel = document.getElementById('filtroCategoria');
  const valorActual = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>';
  DB.getCategorias().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === valorActual)) sel.value = valorActual;
}

function renderDeudas() {
  const filtro = document.getElementById('filtroCategoria').value;
  const deudas = DB.getDeudas().filter(d => d.activa && (!filtro || d.categoria === filtro));
  const container = document.getElementById('deudasList');
  document.getElementById('archivadasCount').textContent = `(${DB.getDeudasArchivadas().length})`;

  if (deudas.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay deudas activas en esta categoría.</div>';
    return;
  }

  const grupos = {};
  deudas.forEach(d => {
    const cat = d.categoria || 'Otros';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(d);
  });

  container.innerHTML = Object.keys(grupos).sort().map(cat => {
    const items = grupos[cat].map(d => {
      const pago = DB.getPago(d.id, currentMonth);
      return deudaCardHtml(d, pago);
    }).join('');
    return `<div class="deuda-group">
      <div class="deuda-group-title">${escapeHtml(cat)}</div>
      <div class="deuda-group-items">${items}</div>
    </div>`;
  }).join('');

  attachDeudaCardEvents(container);
}

function deudaCardHtml(deuda, pago) {
  const acumulada = pago ? pago.cuotaPagadaAcumulada : null;
  const finalizada = deuda.tipo === 'cuotas' && deuda.cuotasTotales != null && acumulada != null && acumulada >= deuda.cuotasTotales;
  const cuotasInfo = deuda.tipo === 'cuotas'
    ? `${acumulada ?? 0}/${deuda.cuotasTotales ?? '?'} cuotas`
    : 'Gasto recurrente';
  const pct = (deuda.tipo === 'cuotas' && deuda.cuotasTotales) ? Math.min(100, Math.round(((acumulada ?? 0) / deuda.cuotasTotales) * 100)) : null;

  const rightControl = finalizada
    ? `<button class="finalizada-badge" data-archivar-id="${deuda.id}">✓ Completa · Archivar</button>`
    : `<button class="estado-toggle ${pago && pago.pagado ? 'pagado' : 'pendiente'}" data-toggle-id="${deuda.id}">
        ${pago && pago.pagado ? '✓ Pagado' : 'Pendiente'}
      </button>`;

  return `<div class="deuda-card" data-open-id="${deuda.id}">
    <div class="deuda-icon">${escapeHtml(deuda.icono || '📌')}</div>
    <div class="deuda-info">
      <div class="deuda-empresa">${escapeHtml(deuda.empresa)}</div>
      <div class="deuda-detalle">${escapeHtml(deuda.detalle)}</div>
      <div class="deuda-meta">
        <span class="valor">${Utils.formatCLP(pago ? pago.gasto : deuda.valorCuota)}</span>
        <span>·</span>
        <span>${cuotasInfo}</span>
      </div>
      ${pct != null ? `<div class="mini-progress-track"><div class="mini-progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
    ${rightControl}
  </div>`;
}

function attachDeudaCardEvents(container) {
  container.querySelectorAll('[data-toggle-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleId;
      const pago = DB.getPago(id, currentMonth);
      DB.marcarPago(id, currentMonth, !(pago && pago.pagado));
      renderAll();
    });
  });
  container.querySelectorAll('[data-archivar-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      DB.archivarDeuda(btn.dataset.archivarId);
      renderAll();
      showToast('Deuda archivada');
    });
  });
  container.querySelectorAll('[data-open-id]').forEach(card => {
    card.addEventListener('click', () => openDeudaDetail(card.dataset.openId));
  });
}

function openDeudaForm(deuda) {
  const editing = !!deuda;
  const d = deuda || { empresa: '', detalle: '', categoria: DB.getCategorias()[0], icono: '📌', tipo: 'recurrente', cuotasTotales: '', valorCuota: '', cuotasPagadasBase: 0, notas: '' };
  const empresas = DB.getEmpresas();
  const categorias = DB.getCategorias();
  const empresaEsNueva = !d.empresa || !empresas.includes(d.empresa);

  openSheet(`
    <h2>${editing ? 'Editar deuda' : 'Nueva deuda'}</h2>
    <div class="form-group">
      <label>Ícono</label>
      <div class="icon-picker" id="f-icon-picker">
        ${ICONOS_DEUDA.map(ic => `<button type="button" data-icono="${ic}" class="${ic === d.icono ? 'active' : ''}">${ic}</button>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label>Empresa / Entidad</label>
      <select id="f-empresa">
        ${empresas.map(e => `<option value="${escapeAttr(e)}" ${e === d.empresa ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
        <option value="__nueva__" ${empresaEsNueva ? 'selected' : ''}>+ Nueva empresa…</option>
      </select>
      <input type="text" id="f-empresa-nueva" value="${empresaEsNueva ? escapeAttr(d.empresa) : ''}" placeholder="Nombre de la nueva empresa" style="margin-top:8px; ${empresaEsNueva ? '' : 'display:none'}">
    </div>
    <div class="form-group">
      <label>Detalle</label>
      <input type="text" id="f-detalle" value="${escapeAttr(d.detalle)}" placeholder="Ej: Electricidad, Crédito auto...">
    </div>
    <div class="form-group">
      <label>Categoría</label>
      <select id="f-categoria">
        ${categorias.map(c => `<option value="${escapeAttr(c)}" ${c === d.categoria ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        <option value="__nueva__">+ Nueva categoría…</option>
      </select>
      <input type="text" id="f-categoria-nueva" value="" placeholder="Nombre de la nueva categoría" style="margin-top:8px; display:none">
    </div>
    <div class="form-group">
      <label>Tipo</label>
      <div class="segmented" id="f-tipo-segmented">
        <button type="button" data-tipo="recurrente" class="${d.tipo === 'recurrente' ? 'active' : ''}">Gasto recurrente</button>
        <button type="button" data-tipo="cuotas" class="${d.tipo === 'cuotas' ? 'active' : ''}">Crédito en cuotas</button>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" id="f-cuotasTotales-group" style="${d.tipo === 'cuotas' ? '' : 'display:none'}">
        <label>N° total de cuotas</label>
        <input type="number" id="f-cuotasTotales" value="${d.cuotasTotales ?? ''}" placeholder="Ej: 12">
      </div>
      <div class="form-group">
        <label>Valor cuota / gasto mensual</label>
        <input type="number" id="f-valorCuota" value="${d.valorCuota}" placeholder="Ej: 25000">
      </div>
    </div>
    <div class="form-group" id="f-cuotasPagadas-group" style="${(!editing && d.tipo === 'cuotas') ? '' : 'display:none'}">
      <label>Cuotas ya pagadas antes de este mes</label>
      <input type="number" id="f-cuotasPagadasBase" value="${d.cuotasPagadasBase || 0}">
    </div>
    <div class="form-group">
      <label>Notas (opcional)</label>
      <textarea id="f-notas">${escapeHtml(d.notas || '')}</textarea>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnGuardarDeuda">Guardar</button>
      <button class="btn btn-secondary full" id="btnCancelarDeuda">Cancelar</button>
    </div>
  `);

  const segmented = document.getElementById('f-tipo-segmented');
  segmented.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      segmented.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const isCuotas = b.dataset.tipo === 'cuotas';
      document.getElementById('f-cuotasTotales-group').style.display = isCuotas ? '' : 'none';
      document.getElementById('f-cuotasPagadas-group').style.display = (isCuotas && !editing) ? '' : 'none';
    });
  });

  let iconoSeleccionado = d.icono || '📌';
  const iconPicker = document.getElementById('f-icon-picker');
  iconPicker.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      iconPicker.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      iconoSeleccionado = b.dataset.icono;
    });
  });

  document.getElementById('f-empresa').addEventListener('change', (e) => {
    document.getElementById('f-empresa-nueva').style.display = e.target.value === '__nueva__' ? '' : 'none';
  });
  document.getElementById('f-categoria').addEventListener('change', (e) => {
    document.getElementById('f-categoria-nueva').style.display = e.target.value === '__nueva__' ? '' : 'none';
  });

  document.getElementById('btnCancelarDeuda').addEventListener('click', closeSheet);
  document.getElementById('btnGuardarDeuda').addEventListener('click', () => {
    const empresaSel = document.getElementById('f-empresa').value;
    const empresa = empresaSel === '__nueva__' ? document.getElementById('f-empresa-nueva').value.trim() : empresaSel;
    const detalle = document.getElementById('f-detalle').value.trim();
    if (!empresa || !detalle) { showToast('Completa empresa y detalle'); return; }
    const tipo = segmented.querySelector('button.active').dataset.tipo;
    const valorCuota = Utils.parseCLP(document.getElementById('f-valorCuota').value);
    const cuotasTotales = tipo === 'cuotas' ? (parseInt(document.getElementById('f-cuotasTotales').value, 10) || null) : null;
    const categoriaSel = document.getElementById('f-categoria').value;
    const categoria = categoriaSel === '__nueva__' ? document.getElementById('f-categoria-nueva').value.trim() : categoriaSel;
    if (!categoria) { showToast('Escribe el nombre de la nueva categoría'); return; }
    const notas = document.getElementById('f-notas').value.trim();
    const icono = iconoSeleccionado;

    DB.addEmpresa(empresa);
    DB.addCategoria(categoria);

    if (editing) {
      DB.updateDeuda(deuda.id, { empresa, detalle, categoria, icono, tipo, cuotasTotales, valorCuota, notas });
      const pagoActual = DB.getPago(deuda.id, currentMonth);
      if (pagoActual && !pagoActual.pagado) {
        DB.upsertPago({ ...pagoActual, gasto: valorCuota });
      }
      showToast('Deuda actualizada');
    } else {
      const cuotasPagadasBase = tipo === 'cuotas' ? (parseInt(document.getElementById('f-cuotasPagadasBase').value, 10) || 0) : 0;
      const nueva = DB.addDeuda({ empresa, detalle, categoria, icono, tipo, cuotasTotales, valorCuota, cuotasPagadasBase, fechaInicio: currentMonth });
      DB.ensureMes(currentMonth);
      showToast('Deuda agregada');
    }
    closeSheet();
    refreshCategoriaFilterOptions();
    renderMaestros();
    renderAll();
  });
}

function openDeudaDetail(id) {
  const deuda = DB.getDeuda(id);
  if (!deuda) return;
  const historial = DB.getPagosDeDeuda(id);

  openSheet(`
    <h2>${escapeHtml(deuda.icono || '📌')} ${escapeHtml(deuda.detalle)}</h2>
    <p class="muted" style="margin-top:-10px">${escapeHtml(deuda.empresa)} · ${escapeHtml(deuda.categoria)}</p>
    ${!deuda.activa ? `<div class="form-group"><span class="badge-estado reembolsado">Archivada el ${formatFechaCorta(deuda.fechaArchivo.slice(0, 10))}</span></div>` : ''}
    <div class="sheet-actions">
      <button class="btn btn-secondary full" id="btnEditarDeuda">Editar datos</button>
      ${deuda.activa ? '<button class="btn btn-secondary full" id="btnArchivarDeuda">Archivar (cuenta saldada/cerrada)</button>' : '<button class="btn btn-secondary full" id="btnReactivarDeuda">Reactivar deuda</button>'}
    </div>
    <div class="section-block">
      <h2>Historial de pagos</h2>
      <div class="historial-list">
        ${historial.length ? historial.map(p => `
          <div class="historial-row">
            <span class="h-mes">${Utils.monthLabel(p.mes)}</span>
            <span>${Utils.formatCLP(p.gasto)}</span>
            <span>${p.pagado ? `✓ Pagado${p.fechaPago ? ' · ' + formatFechaCorta(p.fechaPago.slice(0, 10)) : ''}` : 'Pendiente'}</span>
          </div>`).join('') : '<div class="empty-state">Sin historial aún</div>'}
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-danger full" id="btnEliminarDeuda">Eliminar deuda</button>
      <button class="btn btn-secondary full" id="btnCerrarDetalle">Cerrar</button>
    </div>
  `);

  document.getElementById('btnEditarDeuda').addEventListener('click', () => openDeudaForm(deuda));
  document.getElementById('btnCerrarDetalle').addEventListener('click', closeSheet);
  document.getElementById('btnEliminarDeuda').addEventListener('click', () => {
    if (confirm(`¿Eliminar "${deuda.detalle}"? Esta acción no se puede deshacer.`)) {
      DB.deleteDeuda(id);
      closeSheet();
      renderAll();
      showToast('Deuda eliminada');
    }
  });

  const btnArchivar = document.getElementById('btnArchivarDeuda');
  if (btnArchivar) btnArchivar.addEventListener('click', () => {
    DB.archivarDeuda(id);
    closeSheet();
    renderAll();
    showToast('Deuda archivada');
  });
  const btnReactivar = document.getElementById('btnReactivarDeuda');
  if (btnReactivar) btnReactivar.addEventListener('click', () => {
    DB.reactivarDeuda(id);
    closeSheet();
    renderAll();
    showToast('Deuda reactivada');
  });
}

function openArchivadasSheet() {
  const archivadas = DB.getDeudasArchivadas();
  openSheet(`
    <h2>Archivadas / pagadas</h2>
    <div class="historial-list" style="gap:8px">
      ${archivadas.length ? archivadas.map(d => `
        <div class="archivada-row" data-open-archivada="${d.id}">
          <div class="deuda-icon">${escapeHtml(d.icono || '📌')}</div>
          <div class="archivada-info">
            <div class="deuda-detalle">${escapeHtml(d.detalle)}</div>
            <div class="gasto-meta">${escapeHtml(d.empresa)} · ${Utils.formatCLP(d.valorCuota)}</div>
            <div class="archivada-fecha">Archivada el ${d.fechaArchivo ? formatFechaCorta(d.fechaArchivo.slice(0, 10)) : '—'}</div>
          </div>
        </div>
      `).join('') : '<div class="empty-state">Aún no tienes deudas archivadas o pagadas.</div>'}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-secondary full" id="btnCerrarArchivadas">Cerrar</button>
    </div>
  `);
  document.getElementById('btnCerrarArchivadas').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-open-archivada]').forEach(row => {
    row.addEventListener('click', () => openDeudaDetail(row.dataset.openArchivada));
  });
}

// ---------- INGRESOS ----------
function renderIngresos() {
  const ingresos = DB.getIngresosDeMes(currentMonth);
  const total = ingresos.reduce((s, i) => s + Number(i.monto), 0);
  document.getElementById('ingresosTotalMes').textContent = Utils.formatCLP(total);

  const list = document.getElementById('ingresosList');
  if (ingresos.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin ingresos registrados este mes.</div>';
    return;
  }
  list.innerHTML = ingresos.map(i => `
    <div class="ingreso-card">
      <div>
        <div class="ingreso-fuente">${escapeHtml(i.fuente)}</div>
        <div class="ingreso-tipo">${escapeHtml(i.tipo)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="ingreso-monto">${Utils.formatCLP(i.monto)}</span>
        <div class="ingreso-actions">
          <button class="icon-action" data-edit-ingreso="${i.id}">✎</button>
          <button class="icon-action" data-del-ingreso="${i.id}">✕</button>
        </div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit-ingreso]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ing = DB.getIngresos().find(x => x.id === btn.dataset.editIngreso);
      openIngresoForm(ing);
    });
  });
  list.querySelectorAll('[data-del-ingreso]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar este ingreso?')) {
        DB.deleteIngreso(btn.dataset.delIngreso);
        renderAll();
        showToast('Ingreso eliminado');
      }
    });
  });
}

function openIngresoForm(ingreso) {
  const editing = !!ingreso;
  const i = ingreso || { fuente: '', monto: '', tipo: 'fijo', notas: '' };
  openSheet(`
    <h2>${editing ? 'Editar ingreso' : 'Nuevo ingreso'}</h2>
    <div class="form-group">
      <label>Fuente</label>
      <input type="text" id="f-fuente" value="${escapeAttr(i.fuente)}" placeholder="Ej: Sueldo, Bono, Venta...">
    </div>
    <div class="form-group">
      <label>Monto</label>
      <input type="number" id="f-monto" value="${i.monto}" placeholder="Ej: 500000">
    </div>
    <div class="form-group">
      <label>Tipo</label>
      <div class="segmented" id="f-tipo-ingreso-segmented">
        <button type="button" data-tipo="fijo" class="${i.tipo === 'fijo' ? 'active' : ''}">Fijo</button>
        <button type="button" data-tipo="variable" class="${i.tipo === 'variable' ? 'active' : ''}">Variable</button>
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnGuardarIngreso">Guardar</button>
      <button class="btn btn-secondary full" id="btnCancelarIngreso">Cancelar</button>
    </div>
  `);

  const seg = document.getElementById('f-tipo-ingreso-segmented');
  seg.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  document.getElementById('btnCancelarIngreso').addEventListener('click', closeSheet);
  document.getElementById('btnGuardarIngreso').addEventListener('click', () => {
    const fuente = document.getElementById('f-fuente').value.trim();
    const monto = Utils.parseCLP(document.getElementById('f-monto').value);
    const tipo = seg.querySelector('button.active').dataset.tipo;
    if (!fuente || !monto) { showToast('Completa fuente y monto'); return; }
    if (editing) {
      DB.updateIngreso(ingreso.id, { fuente, monto, tipo });
      showToast('Ingreso actualizado');
    } else {
      DB.addIngreso({ fuente, monto, tipo, mes: currentMonth });
      showToast('Ingreso agregado');
    }
    closeSheet();
    renderAll();
  });
}

// ---------- GASTOS (consumo propio / por rendir a la empresa) ----------
function renderGastos() {
  renderConsumo();
  renderRendir();
}

function renderConsumo() {
  const gastos = DB.getGastosDeMes(currentMonth, 'consumo').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = gastos.reduce((s, g) => s + Number(g.monto), 0);
  document.getElementById('consumoTotalMes').textContent = Utils.formatCLP(total);

  const list = document.getElementById('consumoList');
  if (gastos.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin gastos de consumo registrados este mes.</div>';
    return;
  }
  list.innerHTML = gastos.map(g => gastoCardHtml(g)).join('');
  attachGastoCardEvents(list);
}

function renderRendir() {
  const gastos = DB.getGastos().filter(g => g.tipo === 'rendir').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pendiente = gastos.filter(g => g.estado === 'pendiente').reduce((s, g) => s + Number(g.monto), 0);
  const rendido = gastos.filter(g => g.estado === 'rendido').reduce((s, g) => s + Number(g.monto), 0);
  document.getElementById('rendirPendienteMonto').textContent = Utils.formatCLP(pendiente);
  document.getElementById('rendirRendidoMonto').textContent = Utils.formatCLP(rendido);

  const list = document.getElementById('rendirList');
  if (gastos.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin gastos por rendir registrados.</div>';
    return;
  }
  const activos = gastos.filter(g => g.estado !== 'reembolsado');
  const cerrados = gastos.filter(g => g.estado === 'reembolsado');
  let html = '';
  html += `<div class="deuda-group-title">Activos</div>`;
  html += activos.length ? activos.map(g => gastoCardHtml(g)).join('') : '<div class="empty-state">Nada pendiente 🎉</div>';
  if (cerrados.length) {
    html += `<div class="deuda-group-title" style="margin-top:14px">Reembolsados</div>`;
    html += cerrados.map(g => gastoCardHtml(g)).join('');
  }
  list.innerHTML = html;
  attachGastoCardEvents(list);
}

function gastoCardHtml(g) {
  const badge = g.tipo === 'rendir'
    ? `<span class="badge-estado ${g.estado}">${g.estado === 'pendiente' ? 'Pendiente' : g.estado === 'rendido' ? 'Rendido' : 'Reembolsado'}</span>`
    : '';
  return `<div class="gasto-card" data-open-gasto="${g.id}">
    <div id="thumb-${g.id}" class="gasto-thumb-placeholder">🧾</div>
    <div class="gasto-info">
      <div class="gasto-detalle">${escapeHtml(g.detalle)}</div>
      <div class="gasto-meta"><span class="valor">${Utils.formatCLP(g.monto)}</span> · ${formatFechaCorta(g.fecha)} · ${escapeHtml(g.categoria)}</div>
    </div>
    <div class="gasto-right">${badge}</div>
  </div>`;
}

function formatFechaCorta(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function attachGastoCardEvents(container) {
  container.querySelectorAll('[data-open-gasto]').forEach(card => {
    card.addEventListener('click', () => openGastoDetail(card.dataset.openGasto));
    const g = DB.getGasto(card.dataset.openGasto);
    if (g && g.fotoBoletaId) {
      Photos.getURL(g.fotoBoletaId).then(url => {
        if (!url) return;
        const el = card.querySelector(`#thumb-${g.id}`);
        if (el) el.outerHTML = `<img id="thumb-${g.id}" class="gasto-thumb" src="${url}">`;
      });
    }
  });
}

function openGastoForm(gasto, tipoDefault) {
  const editing = !!gasto;
  const g = gasto || {
    tipo: tipoDefault || 'consumo', detalle: '', monto: '', fecha: new Date().toISOString().slice(0, 10),
    categoria: CATEGORIAS_CONSUMO[0], notas: '',
  };

  openSheet(`
    <h2>${editing ? 'Editar gasto' : 'Nuevo gasto'}</h2>
    <div class="form-group">
      <label>Tipo de gasto</label>
      <div class="segmented" id="f-tipo-gasto-segmented">
        <button type="button" data-tipo="consumo" class="${g.tipo === 'consumo' ? 'active' : ''}">Consumo propio</button>
        <button type="button" data-tipo="rendir" class="${g.tipo === 'rendir' ? 'active' : ''}">Por rendir a empresa</button>
      </div>
    </div>
    <div class="form-group">
      <label>Detalle</label>
      <input type="text" id="f-detalle" value="${escapeAttr(g.detalle)}" placeholder="Ej: Almuerzo, Bencina, Materiales...">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Monto</label>
        <input type="number" id="f-monto" value="${g.monto}" placeholder="Ej: 8000">
      </div>
      <div class="form-group">
        <label>Fecha</label>
        <input type="date" id="f-fecha" value="${g.fecha}">
      </div>
    </div>
    <div class="form-group" id="f-categoria-group" style="${g.tipo === 'rendir' ? 'display:none' : ''}">
      <label>Categoría</label>
      <select id="f-categoria">
        ${CATEGORIAS_CONSUMO.map(c => `<option value="${c}" ${c === g.categoria ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Notas (opcional)</label>
      <textarea id="f-notas">${escapeHtml(g.notas || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Foto de la boleta (opcional)</label>
      <div class="photo-attach-row">
        <div id="previewBoleta"><div class="photo-preview-empty">🧾</div></div>
        <button type="button" class="btn-photo" id="btnTomarBoleta">📷 Tomar / adjuntar foto</button>
        <input type="file" id="inputBoleta" accept="image/*" capture="environment" hidden>
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnGuardarGasto">Guardar</button>
      <button class="btn btn-secondary full" id="btnCancelarGasto">Cancelar</button>
    </div>
  `);

  const tipoSeg = document.getElementById('f-tipo-gasto-segmented');
  tipoSeg.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      tipoSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('f-categoria-group').style.display = b.dataset.tipo === 'rendir' ? 'none' : '';
    });
  });

  let fotoBoletaId = g.fotoBoletaId || null;
  if (fotoBoletaId) {
    Photos.getURL(fotoBoletaId).then(url => {
      if (url) document.getElementById('previewBoleta').innerHTML = `<img class="photo-preview" src="${url}">`;
    });
  }

  document.getElementById('btnTomarBoleta').addEventListener('click', () => document.getElementById('inputBoleta').click());
  document.getElementById('inputBoleta').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    document.getElementById('previewBoleta').innerHTML = `<img class="photo-preview" src="${localUrl}">`;
    const id = fotoBoletaId || Utils.uid();
    await Photos.save(id, file);
    fotoBoletaId = id;
  });

  document.getElementById('btnCancelarGasto').addEventListener('click', closeSheet);
  document.getElementById('btnGuardarGasto').addEventListener('click', () => {
    const tipo = tipoSeg.querySelector('button.active').dataset.tipo;
    const esRendir = tipo === 'rendir';
    const detalle = document.getElementById('f-detalle').value.trim();
    const monto = Utils.parseCLP(document.getElementById('f-monto').value);
    const fecha = document.getElementById('f-fecha').value || new Date().toISOString().slice(0, 10);
    const notas = document.getElementById('f-notas').value.trim();
    const categoria = esRendir ? 'Gasto Empresa' : document.getElementById('f-categoria').value;
    if (!detalle || !monto) { showToast('Completa detalle y monto'); return; }

    if (editing) {
      const patch = { tipo, detalle, monto, fecha, notas, categoria, fotoBoletaId };
      if (esRendir && gasto.tipo !== 'rendir') { patch.estado = 'pendiente'; patch.fechaRendido = null; patch.fechaReembolso = null; }
      DB.updateGasto(gasto.id, patch);
      showToast('Gasto actualizado');
    } else {
      DB.addGasto({ tipo, detalle, monto, fecha, notas, categoria, fotoBoletaId });
      showToast(esRendir ? 'Gasto por rendir agregado' : 'Consumo agregado');
    }
    closeSheet();
    renderAll();
  });
}

function openGastoDetail(id) {
  const gasto = DB.getGasto(id);
  if (!gasto) return;
  if (gasto.tipo === 'consumo') { openGastoForm(gasto); return; }

  openSheet(`
    <h2>${escapeHtml(gasto.detalle)}</h2>
    <p class="muted" style="margin-top:-10px">${Utils.formatCLP(gasto.monto)} · ${formatFechaCorta(gasto.fecha)}</p>
    <div class="form-group">
      <span class="badge-estado ${gasto.estado}">${gasto.estado === 'pendiente' ? 'Pendiente de rendir' : gasto.estado === 'rendido' ? 'Rendido — por cobrar' : 'Reembolsado'}</span>
    </div>

    <div class="form-group">
      <label>Boleta del consumo</label>
      <div class="photo-attach-row">
        <div id="previewBoletaDet"><div class="photo-preview-empty">🧾</div></div>
        <button type="button" class="btn-photo" id="btnTomarBoletaDet">📷 ${gasto.fotoBoletaId ? 'Cambiar' : 'Adjuntar'} boleta</button>
        <input type="file" id="inputBoletaDet" accept="image/*" capture="environment" hidden>
      </div>
    </div>

    <div class="form-group">
      <label>Comprobante bancario (retiro o depósito)</label>
      <div class="photo-attach-row">
        <div id="previewComprobanteDet"><div class="photo-preview-empty">🏦</div></div>
        <button type="button" class="btn-photo" id="btnTomarComprobanteDet">📷 ${gasto.fotoComprobanteId ? 'Cambiar' : 'Adjuntar'} comprobante</button>
        <input type="file" id="inputComprobanteDet" accept="image/*" capture="environment" hidden>
      </div>
    </div>

    <div class="sheet-actions">
      <button class="btn btn-secondary full" id="btnEditarGasto">Editar datos</button>
      ${gasto.estado === 'pendiente' ? '<button class="btn btn-primary full" id="btnMarcarRendido">Marcar como Rendido</button>' : ''}
      ${gasto.estado === 'rendido' ? '<button class="btn btn-primary full" id="btnMarcarReembolsado">Marcar como Reembolsado</button>' : ''}
      ${gasto.estado !== 'pendiente' ? '<button class="btn btn-secondary full" id="btnRevertirEstado">Revertir estado anterior</button>' : ''}
    </div>
    <div class="sheet-actions">
      <button class="btn btn-danger full" id="btnEliminarGasto">Eliminar</button>
      <button class="btn btn-secondary full" id="btnCerrarGastoDetalle">Cerrar</button>
    </div>
  `);

  if (gasto.fotoBoletaId) {
    Photos.getURL(gasto.fotoBoletaId).then(url => {
      if (url) document.getElementById('previewBoletaDet').innerHTML = `<img class="photo-preview" src="${url}">`;
    });
  }
  if (gasto.fotoComprobanteId) {
    Photos.getURL(gasto.fotoComprobanteId).then(url => {
      if (url) document.getElementById('previewComprobanteDet').innerHTML = `<img class="photo-preview" src="${url}">`;
    });
  }

  document.getElementById('btnTomarBoletaDet').addEventListener('click', () => document.getElementById('inputBoletaDet').click());
  document.getElementById('inputBoletaDet').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('previewBoletaDet').innerHTML = `<img class="photo-preview" src="${URL.createObjectURL(file)}">`;
    const id = gasto.fotoBoletaId || Utils.uid();
    await Photos.save(id, file);
    DB.updateGasto(gasto.id, { fotoBoletaId: id });
    showToast('Boleta guardada');
  });

  document.getElementById('btnTomarComprobanteDet').addEventListener('click', () => document.getElementById('inputComprobanteDet').click());
  document.getElementById('inputComprobanteDet').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('previewComprobanteDet').innerHTML = `<img class="photo-preview" src="${URL.createObjectURL(file)}">`;
    const id = gasto.fotoComprobanteId || Utils.uid();
    await Photos.save(id, file);
    DB.updateGasto(gasto.id, { fotoComprobanteId: id });
    showToast('Comprobante guardado');
  });

  document.getElementById('btnEditarGasto').addEventListener('click', () => openGastoForm(gasto));
  document.getElementById('btnCerrarGastoDetalle').addEventListener('click', closeSheet);

  const btnRendido = document.getElementById('btnMarcarRendido');
  if (btnRendido) btnRendido.addEventListener('click', () => {
    DB.updateGasto(gasto.id, { estado: 'rendido', fechaRendido: new Date().toISOString() });
    closeSheet();
    renderAll();
    showToast('Marcado como rendido');
  });

  const btnReembolsado = document.getElementById('btnMarcarReembolsado');
  if (btnReembolsado) btnReembolsado.addEventListener('click', () => {
    const actual = DB.getGasto(gasto.id);
    if (!actual.fotoComprobanteId) {
      if (!confirm('Aún no adjuntaste el comprobante bancario. ¿Marcar como reembolsado de todas formas?')) return;
    }
    DB.updateGasto(gasto.id, { estado: 'reembolsado', fechaReembolso: new Date().toISOString() });
    closeSheet();
    renderAll();
    showToast('Marcado como reembolsado');
  });

  const btnRevertir = document.getElementById('btnRevertirEstado');
  if (btnRevertir) btnRevertir.addEventListener('click', () => {
    const anterior = gasto.estado === 'reembolsado' ? 'rendido' : 'pendiente';
    DB.updateGasto(gasto.id, { estado: anterior });
    closeSheet();
    renderAll();
    showToast('Estado revertido');
  });

  document.getElementById('btnEliminarGasto').addEventListener('click', () => {
    if (confirm(`¿Eliminar "${gasto.detalle}"? Esta acción no se puede deshacer.`)) {
      DB.deleteGasto(gasto.id);
      closeSheet();
      renderAll();
      showToast('Gasto eliminado');
    }
  });
}

// ---------- AJUSTES ----------
function wireAjustes() {
  document.getElementById('btnExport').addEventListener('click', () => {
    const data = DB.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzas-respaldo-${Utils.monthKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('inputImport').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        DB.importAll(reader.result);
        showToast('Respaldo importado');
        renderAll();
      } catch (err) {
        showToast('Archivo inválido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('Esto borrará todos los datos guardados en este dispositivo. ¿Continuar?')) {
      DB.resetAll();
      DB.seedIfEmpty();
      currentMonth = DB.getMeta().mesActual || Utils.monthKey();
      renderAll();
      renderLockUi();
      showToast('Datos reiniciados');
    }
  });

  wireSeguridad();
  wireMaestros();
}

// ---------- Maestros (Empresas / Categorías) ----------
function openTextPrompt(titulo, valorInicial, onGuardar) {
  openSheet(`
    <h2>${escapeHtml(titulo)}</h2>
    <div class="form-group">
      <input type="text" id="f-prompt-valor" value="${escapeAttr(valorInicial || '')}" placeholder="Nombre">
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnPromptGuardar">Guardar</button>
      <button class="btn btn-secondary full" id="btnPromptCancelar">Cancelar</button>
    </div>
  `);
  const input = document.getElementById('f-prompt-valor');
  setTimeout(() => input.focus(), 50);
  document.getElementById('btnPromptCancelar').addEventListener('click', closeSheet);
  const guardar = () => {
    const val = input.value.trim();
    if (!val) { showToast('Escribe un nombre'); return; }
    onGuardar(val);
    closeSheet();
  };
  document.getElementById('btnPromptGuardar').addEventListener('click', guardar);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
}

function renderMaestros() {
  const empresasEl = document.getElementById('empresasList');
  const empresas = DB.getEmpresas();
  empresasEl.innerHTML = empresas.length ? empresas.map(e => `
    <div class="maestro-row">
      <span>${escapeHtml(e)}</span>
      <div class="maestro-actions">
        <button class="icon-action" data-edit-empresa="${escapeAttr(e)}">✎</button>
        <button class="icon-action" data-del-empresa="${escapeAttr(e)}">✕</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state">Aún no tienes empresas registradas.</div>';

  empresasEl.querySelectorAll('[data-edit-empresa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.editEmpresa;
      openTextPrompt('Renombrar empresa', nombre, (nuevo) => {
        DB.renameEmpresa(nombre, nuevo);
        renderMaestros();
        renderAll();
        showToast('Empresa actualizada');
      });
    });
  });
  empresasEl.querySelectorAll('[data-del-empresa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.delEmpresa;
      if (confirm(`¿Quitar "${nombre}" de la lista de empresas? Las deudas que ya la usan no se modifican.`)) {
        DB.deleteEmpresa(nombre);
        renderMaestros();
        showToast('Empresa quitada de la lista');
      }
    });
  });

  const categoriasEl = document.getElementById('categoriasList');
  const categorias = DB.getCategorias();
  categoriasEl.innerHTML = categorias.length ? categorias.map(c => `
    <div class="maestro-row">
      <span>${escapeHtml(c)}</span>
      <div class="maestro-actions">
        <button class="icon-action" data-edit-categoria="${escapeAttr(c)}">✎</button>
        <button class="icon-action" data-del-categoria="${escapeAttr(c)}">✕</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state">Sin categorías.</div>';

  categoriasEl.querySelectorAll('[data-edit-categoria]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.editCategoria;
      openTextPrompt('Renombrar categoría', nombre, (nuevo) => {
        DB.renameCategoria(nombre, nuevo);
        renderMaestros();
        refreshCategoriaFilterOptions();
        renderAll();
        showToast('Categoría actualizada');
      });
    });
  });
  categoriasEl.querySelectorAll('[data-del-categoria]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.delCategoria;
      if (confirm(`¿Quitar "${nombre}" de la lista de categorías?`)) {
        DB.deleteCategoria(nombre);
        renderMaestros();
        refreshCategoriaFilterOptions();
        showToast('Categoría quitada de la lista');
      }
    });
  });
}

function wireMaestros() {
  document.getElementById('btnAgregarEmpresa').addEventListener('click', () => {
    openTextPrompt('Nueva empresa', '', (nombre) => {
      DB.addEmpresa(nombre);
      renderMaestros();
      showToast('Empresa agregada');
    });
  });
  document.getElementById('btnAgregarCategoria').addEventListener('click', () => {
    openTextPrompt('Nueva categoría', '', (nombre) => {
      DB.addCategoria(nombre);
      renderMaestros();
      refreshCategoriaFilterOptions();
      showToast('Categoría agregada');
    });
  });
  renderMaestros();
}

// ---------- Seguridad (PIN + Face ID / Touch ID) ----------
function wireLock() {
  document.getElementById('btnLockUnlock').addEventListener('click', intentarDesbloquear);
  document.getElementById('lockPinInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') intentarDesbloquear();
  });
  document.getElementById('lockPinInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, Lock.PIN_LARGO);
    if (e.target.value.length >= Lock.PIN_LARGO) intentarDesbloquear();
  });
  document.getElementById('btnUsarFaceId').addEventListener('click', intentarBiometrico);
  document.getElementById('btnLockForgot').addEventListener('click', () => {
    if (confirm('Esto borrará TODOS los datos de la app (deudas, gastos, ingresos y fotos) para restablecer el acceso. ¿Continuar?')) {
      DB.resetAll();
      location.reload();
    }
  });
}

async function intentarDesbloquear() {
  if (!Lock.isEnabled()) return;
  const input = document.getElementById('lockPinInput');
  const ok = await Lock.verify(input.value);
  if (ok) {
    document.getElementById('lockError').classList.add('hidden');
    Lock.hideOverlay();
    init();
  } else {
    document.getElementById('lockError').classList.remove('hidden');
    input.value = '';
    input.focus();
  }
}

async function intentarBiometrico() {
  if (!Biometric.isEnabled()) return;
  try {
    const ok = await Biometric.verificar();
    if (ok) {
      Lock.hideOverlay();
      init();
    }
  } catch (e) {
    // El usuario canceló Face ID o falló; se queda en la pantalla de bloqueo (puede reintentar o usar PIN).
  }
}

function wireSeguridad() {
  document.getElementById('btnConfigurarPin').addEventListener('click', () => openPinSetupForm(false));
  document.getElementById('btnCambiarPin').addEventListener('click', () => openPinSetupForm(true));
  document.getElementById('btnDesactivarPin').addEventListener('click', () => {
    if (confirm('¿Desactivar el bloqueo con PIN?')) {
      Lock.disable();
      renderLockUi();
      showToast('Bloqueo con PIN desactivado');
    }
  });
  document.getElementById('btnActivarBio').addEventListener('click', async () => {
    try {
      await Biometric.registrar();
      renderLockUi();
      showToast('Face ID / Touch ID activado');
    } catch (e) {
      showToast('No se pudo activar (¿cancelaste o el teléfono no tiene Face ID configurado?)');
    }
  });
  document.getElementById('btnDesactivarBio').addEventListener('click', () => {
    if (confirm('¿Desactivar Face ID / Touch ID?')) {
      Biometric.disable();
      renderLockUi();
      showToast('Face ID / Touch ID desactivado');
    }
  });
  document.getElementById('btnBloquearAhora').addEventListener('click', () => {
    if (!protegida()) { showToast('Primero activa un PIN o Face ID'); return; }
    mostrarPantallaBloqueo();
  });
  renderLockUi();
}

async function renderLockUi() {
  const enabled = Lock.isEnabled();
  document.getElementById('lockStatusText').textContent = enabled
    ? 'Bloqueo con PIN activado.'
    : 'Bloqueo con PIN desactivado.';
  document.getElementById('btnConfigurarPin').classList.toggle('hidden', enabled);
  document.getElementById('btnCambiarPin').classList.toggle('hidden', !enabled);
  document.getElementById('btnDesactivarPin').classList.toggle('hidden', !enabled);
  document.getElementById('btnBloquearAhora').classList.toggle('hidden', !protegida());

  const bioDisponible = await Biometric.isAvailable();
  const bioActivo = Biometric.isEnabled();
  const bioStatusText = document.getElementById('bioStatusText');
  if (!bioDisponible) {
    bioStatusText.textContent = 'Face ID / Touch ID no está disponible en este dispositivo o navegador.';
  } else {
    bioStatusText.textContent = bioActivo
      ? 'Face ID / Touch ID activado.'
      : 'Face ID / Touch ID disponible: actívalo para desbloquear sin escribir el PIN.';
  }
  document.getElementById('btnActivarBio').classList.toggle('hidden', !bioDisponible || bioActivo);
  document.getElementById('btnDesactivarBio').classList.toggle('hidden', !bioActivo);
}

function openPinSetupForm(cambiando) {
  openSheet(`
    <h2>${cambiando ? 'Cambiar PIN' : 'Activar bloqueo con PIN'}</h2>
    <div class="form-group">
      <label>Nuevo PIN (4 dígitos)</label>
      <input type="password" id="f-pin1" inputmode="numeric" pattern="[0-9]*" maxlength="4" class="lock-input" style="letter-spacing:6px; font-size:20px;">
    </div>
    <div class="form-group">
      <label>Confirma el PIN</label>
      <input type="password" id="f-pin2" inputmode="numeric" pattern="[0-9]*" maxlength="4" class="lock-input" style="letter-spacing:6px; font-size:20px;">
    </div>
    <p id="pinFormError" class="lock-error hidden">Los PIN no coinciden o no tienen 4 dígitos.</p>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnGuardarPin">Guardar</button>
      <button class="btn btn-secondary full" id="btnCancelarPin">Cancelar</button>
    </div>
  `);
  ['f-pin1', 'f-pin2'].forEach(id => {
    document.getElementById(id).addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, Lock.PIN_LARGO);
    });
  });
  document.getElementById('btnCancelarPin').addEventListener('click', closeSheet);
  document.getElementById('btnGuardarPin').addEventListener('click', async () => {
    const p1 = document.getElementById('f-pin1').value;
    const p2 = document.getElementById('f-pin2').value;
    if (p1.length !== Lock.PIN_LARGO || p1 !== p2) {
      document.getElementById('pinFormError').classList.remove('hidden');
      return;
    }
    await Lock.setPin(p1);
    closeSheet();
    renderLockUi();
    showToast(cambiando ? 'PIN actualizado' : 'Bloqueo activado');
  });
}

// ---------- Temas ----------
function applyTheme(tema) {
  if (!tema || tema === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', tema);
}

function wireThemeGrid() {
  const grid = document.getElementById('themeGrid');
  const activo = DB.getMeta().tema || 'auto';
  grid.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tema === activo);
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(btn.dataset.tema);
      DB.setMeta({ tema: btn.dataset.tema });
    });
  });
}

// ---------- Utils de escape ----------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Service worker (offline) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', boot);
