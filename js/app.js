// app.js — vistas, renderizado y manejo de eventos. Sin dependencias externas.

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

// Tiempo de gracia: si vuelves a la app antes de que pase este lapso desde que se
// ocultó (cambio de app, notificación, etc.), no vuelve a pedir PIN/Face ID. Si el
// sistema mata la página y hay que recargarla de cero, boot() igual bloquea siempre
// (no hay forma de saber cuánto tiempo pasó, así que se prefiere pedir el acceso).
let ultimoOculto = null;

function mostrarOverlayArranque(id) {
  ['loginOverlay', 'cargaOverlay', 'errorConexionOverlay'].forEach(otro => {
    document.getElementById(otro).classList.toggle('visible', otro === id);
  });
}
function ocultarOverlaysArranque() {
  ['loginOverlay', 'cargaOverlay', 'errorConexionOverlay'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });
}

// iOS Safari ignora "user-scalable=no": además de touch-action en el CSS, se anula el
// gesto de pellizco para que la pantalla nunca quede ampliada.
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive: false })
);

// Respaldo contra el zoom por doble toque (iOS a veces lo hace pese a touch-action): un
// segundo toque a menos de 350 ms del anterior no se propaga como zoom. Los campos de
// texto quedan fuera para no molestar al escribir.
let ultimoToque = 0;
document.addEventListener('touchend', e => {
  const ahora = Date.now();
  if (ahora - ultimoToque < 350 && !(e.target.closest && e.target.closest('input, textarea, select'))) e.preventDefault();
  ultimoToque = ahora;
}, { passive: false });

// Si aun así la pantalla quedara ampliada, la devuelve a su tamaño normal.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (window.visualViewport.scale <= 1.01) return;
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    setTimeout(() => meta.setAttribute('content', original), 100);
  });
}

async function boot() {
  applyTheme(DB.getMeta().tema || 'auto');
  wireLock();
  wireLoginScreen();

  if (typeof SUPABASE_CONFIGURADO !== 'undefined' && !SUPABASE_CONFIGURADO) {
    document.documentElement.classList.remove('locked-boot');
    mostrarOverlayArranque('errorConexionOverlay');
    document.querySelector('#errorConexionOverlay h2').textContent = 'Falta configurar Supabase';
    document.querySelector('#errorConexionOverlay .muted').textContent =
      'Edita js/supabase-config.js con la URL y la anon key de tu proyecto de Supabase (ver README).';
    document.getElementById('btnReintentarConexion').classList.add('hidden');
    return;
  }

  const session = await Auth.getSession();
  if (session) {
    await continuarConSesion();
  } else {
    document.documentElement.classList.remove('locked-boot');
    mostrarOverlayArranque('loginOverlay');
  }

  document.addEventListener('visibilitychange', () => {
    if (!protegida()) return;
    if (document.hidden) {
      ultimoOculto = Date.now();
    } else if (ultimoOculto != null) {
      const timeoutMs = (DB.getMeta().bloqueoTimeoutSeg ?? 60) * 1000;
      if (Date.now() - ultimoOculto >= timeoutMs) mostrarPantallaBloqueo();
      ultimoOculto = null;
    }
  });
}

async function continuarConSesion() {
  document.documentElement.classList.remove('locked-boot');
  mostrarOverlayArranque('cargaOverlay');
  try {
    await DB.cargarTodoDesdeSupabase();
  } catch (e) {
    console.error(e);
    document.querySelector('#errorConexionOverlay h2').textContent = 'Sin conexión';
    document.querySelector('#errorConexionOverlay .muted').textContent =
      'Esta app necesita internet para funcionar. Revisa tu conexión e inténtalo de nuevo.';
    document.getElementById('btnReintentarConexion').classList.remove('hidden');
    mostrarOverlayArranque('errorConexionOverlay');
    return;
  }
  ocultarOverlaysArranque();
  if (protegida()) {
    mostrarPantallaBloqueo();
  } else {
    document.documentElement.classList.remove('locked-boot');
    init();
  }
}

function wireLoginScreen() {
  const btnLogin = document.getElementById('btnLogin');
  btnLogin.addEventListener('click', conBloqueoDoble(btnLogin, async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showToast('Completa correo y contraseña'); return false; }
    document.getElementById('loginError').classList.add('hidden');
    try {
      await Auth.login(email, password);
    } catch (e) {
      document.getElementById('loginError').textContent = 'Correo o contraseña incorrectos.';
      document.getElementById('loginError').classList.remove('hidden');
      return false;
    }
    await continuarConSesion();
  }));
  document.getElementById('btnReintentarConexion').addEventListener('click', async () => {
    const session = await Auth.getSession();
    if (session) await continuarConSesion();
    else mostrarOverlayArranque('loginOverlay');
  });
}

let appStarted = false;
function init() {
  if (appStarted) { renderAll(); return; }
  appStarted = true;
  DB.seedIfEmpty();
  DB.migrar();
  const acumCorregidos = DB.sanearPagos();
  currentMonth = DB.getMeta().mesActual || Utils.monthKey();
  DB.ensureMes(currentMonth);
  populateCategoriaFilter();
  wireNav();
  wireMonthSwitch();
  wireFab();
  wireSheetOverlay();
  wireLightbox();
  wireAjustes();
  wireGastoTipoSegmented();
  wireThemeGrid();
  renderAll();
  if (acumCorregidos > 0) showToast(`Se corrigieron ${acumCorregidos} registros de pagos`);
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
  guardandoRegistro = false;
}
function closeSheet() {
  document.getElementById('sheetOverlay').classList.add('hidden');
  document.getElementById('sheetContent').innerHTML = '';
  guardandoRegistro = false;
}

// Evita que un doble-toque (frecuente en iOS cuando el primer toque solo cierra el
// teclado) dispare el guardado dos veces: mientras un guardado está en curso, se
// ignoran los toques adicionales al mismo botón, que además muestra un spinner.
let guardandoRegistro = false;
function conBloqueoDoble(btn, fn) {
  return async () => {
    if (guardandoRegistro) return;
    guardandoRegistro = true;
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Guardando…`;
    try {
      const ok = await fn();
      if (ok === false) {
        guardandoRegistro = false;
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
      }
      // si ok !== false, se asume que la propia acción cerró la sheet (closeSheet ya resetea la bandera)
    } catch (e) {
      console.error(e);
      guardandoRegistro = false;
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  };
}
// ---------- Visor de imágenes ampliadas ----------
function wireLightbox() {
  document.getElementById('btnCerrarLightbox').addEventListener('click', closeLightbox);
  document.getElementById('imageLightbox').addEventListener('click', (e) => {
    if (e.target.id === 'imageLightbox') closeLightbox();
  });
}
function openLightbox(url) {
  if (!url) return;
  document.getElementById('lightboxImg').src = url;
  document.getElementById('imageLightbox').classList.add('visible');
}
function closeLightbox() {
  document.getElementById('imageLightbox').classList.remove('visible');
  document.getElementById('lightboxImg').src = '';
}
function hacerAmpliable(img) {
  img.classList.add('ampliable');
  img.addEventListener('click', (e) => {
    e.stopPropagation();
    openLightbox(img.src);
  });
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

  // Por empresa
  const porCategoria = {};
  pagos.forEach(p => {
    const deuda = deudas.find(d => d.id === p.deudaId);
    if (!deuda) return;
    const cat = deuda.empresa || 'Otros';
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
    .filter(x => x.deuda && x.deuda.activa)
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
        <p>Saldo trasladado a ${mesSiguiente}: <strong>${Utils.formatCLP(Math.max(0, cierre.saldoFinal))}</strong>${cierre.saldoFinal < 0 ? ' (el mes cerró en negativo, así que el siguiente parte en $0)' : ''}${cierre.ajustado ? ' · ajustado a mano' : ''}</p>
        <div class="sheet-actions" style="margin-top:0">
          <button class="btn btn-secondary full" id="btnAjustarSaldo">✎ Ajustar monto (si no registré todo)</button>
          <button class="btn btn-secondary full" id="btnRecalcularCierre">Recalcular desde los datos de la app</button>
          <button class="btn btn-text full" id="btnReabrirCierre">Deshacer cierre</button>
        </div>
      </div>`;
    document.getElementById('btnAjustarSaldo').addEventListener('click', () => abrirAjusteSaldoCierre(currentMonth));
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

function abrirAjusteSaldoCierre(mes) {
  const cierre = DB.getCierre(mes);
  if (!cierre) return;
  openSheet(`
    <h2>Ajustar saldo trasladado</h2>
    <p class="muted" style="margin-top:-10px">Usa esto si no alcanzaste a registrar todos los gastos o ingresos de ${Utils.monthLabel(mes)}, y el monto calculado no es el real.</p>
    <div class="form-group">
      <label>Saldo real que te quedó</label>
      <input type="number" id="f-saldo-ajustado" value="${Math.max(0, cierre.saldoFinal)}" placeholder="Ej: 350000">
    </div>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnGuardarAjusteSaldo">Guardar</button>
      <button class="btn btn-secondary full" id="btnCancelarAjusteSaldo">Cancelar</button>
    </div>
  `);
  document.getElementById('btnCancelarAjusteSaldo').addEventListener('click', closeSheet);
  const btnGuardarAjusteSaldo = document.getElementById('btnGuardarAjusteSaldo');
  btnGuardarAjusteSaldo.addEventListener('click', conBloqueoDoble(btnGuardarAjusteSaldo, () => {
    const nuevo = Utils.parseCLP(document.getElementById('f-saldo-ajustado').value);
    DB.ajustarCierre(mes, nuevo);
    closeSheet();
    renderAll();
    showToast('Saldo ajustado');
  }));
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
  sel.innerHTML = '<option value="">Todas las empresas</option>';
  DB.getEmpresas().forEach(e => {
    const opt = document.createElement('option');
    opt.value = e;
    opt.textContent = e;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === valorActual)) sel.value = valorActual;
}

function renderDeudas() {
  const filtro = document.getElementById('filtroCategoria').value;
  const deudas = DB.getDeudas().filter(d => {
    if (!filtro || d.empresa === filtro) {
      if (d.activa) {
        // Antes del mes de inicio la deuda no existía (salvo que ese mes tenga un pago marcado).
        if (!d.fechaInicio || Utils.compareMonth(currentMonth, d.fechaInicio) >= 0) return true;
        const p = DB.getPago(d.id, currentMonth);
        return !!(p && p.pagado);
      }
      // Recién archivada este mismo mes: se sigue mostrando hasta que cambie el mes.
      return d.fechaArchivo && d.fechaArchivo.slice(0, 7) === currentMonth;
    }
    return false;
  });
  const container = document.getElementById('deudasList');
  document.getElementById('archivadasCount').textContent = `(${DB.getDeudasArchivadas().length})`;

  const resumenEl = document.getElementById('resumenFiltroEmpresa');
  if (filtro && deudas.length > 0) {
    const total = deudas.reduce((s, d) => {
      const pago = DB.getPago(d.id, currentMonth);
      return s + Number(pago ? pago.gasto : d.valorCuota);
    }, 0);
    resumenEl.innerHTML = `
      <span class="rfe-label">${deudas.length} deuda${deudas.length === 1 ? '' : 's'} con ${escapeHtml(filtro)} · ${Utils.monthLabel(currentMonth)}</span>
      <span class="rfe-total">${Utils.formatCLP(total)}</span>
    `;
    resumenEl.classList.remove('hidden');
  } else {
    resumenEl.classList.add('hidden');
  }

  if (deudas.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay deudas activas en esta empresa.</div>';
    return;
  }

  const grupos = {};
  deudas.forEach(d => {
    const cat = d.empresa || 'Otros';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(d);
  });

  container.innerHTML = Object.keys(grupos).sort().map(cat => {
    let totalGrupo = 0;
    const items = grupos[cat].map(d => {
      const pago = DB.getPago(d.id, currentMonth);
      totalGrupo += Number(pago ? pago.gasto : d.valorCuota);
      return deudaCardHtml(d, pago);
    }).join('');
    return `<div class="deuda-group">
      <div class="deuda-group-title"><span>${escapeHtml(cat)}</span><span class="deuda-group-total">${Utils.formatCLP(totalGrupo)}</span></div>
      <div class="deuda-group-items">${items}</div>
    </div>`;
  }).join('');

  attachDeudaCardEvents(container);
}

function deudaCardHtml(deuda, pago) {
  // Siempre calculado desde el historial de pagos (no del valor guardado, que podía quedar desfasado).
  const acumulada = deuda.tipo === 'cuotas' ? DB.cuotasPagadasHasta(deuda.id, pago ? pago.mes : currentMonth) : null;
  const finalizada = deuda.tipo === 'cuotas' && deuda.cuotasTotales != null && acumulada != null && acumulada >= deuda.cuotasTotales;
  const ultimaCuotaPendiente = deuda.tipo === 'cuotas' && deuda.cuotasTotales != null && !finalizada
    && !(pago && pago.pagado) && (acumulada ?? 0) + 1 >= deuda.cuotasTotales;
  const cuotasInfo = deuda.tipo === 'cuotas'
    ? `${acumulada ?? 0}/${deuda.cuotasTotales ?? '?'} cuotas`
    : 'Gasto recurrente';
  const pct = (deuda.tipo === 'cuotas' && deuda.cuotasTotales) ? Math.min(100, Math.round(((acumulada ?? 0) / deuda.cuotasTotales) * 100)) : null;

  const rightControl = !deuda.activa
    ? `<span class="finalizada-badge" style="cursor:default">${finalizada ? '✓ Completa' : '✓ Archivada'}</span>`
    : finalizada
    ? `<button class="finalizada-badge" data-archivar-id="${deuda.id}">✓ Completa · Archivar</button>`
    : ultimaCuotaPendiente
    ? `<button class="finalizada-badge" data-pagar-archivar-id="${deuda.id}">Pagar y archivar</button>`
    : `<button class="estado-toggle ${pago && pago.pagado ? 'pagado' : 'pendiente'}" data-toggle-id="${deuda.id}">
        ${pago && pago.pagado ? '✓ Pagado' : 'Pendiente'}
      </button>`;

  return `<div class="deuda-card" data-open-id="${deuda.id}">
    <div class="deuda-icon" id="deuda-icon-${deuda.id}">${escapeHtml(deuda.icono || '📌')}</div>
    <div class="deuda-info">
      <div class="deuda-empresa">${escapeHtml(deuda.empresa)}${deuda.entidad ? ` · 💳 ${escapeHtml(deuda.entidad)}` : ''}</div>
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

// Si al marcar un pago el crédito quedó completo, la app lo archiva sola: se avisa para que,
// si fue un error, se pueda corregir (desmarcar el mes y reactivar la deuda desde su detalle).
function avisarSiSeArchivo(id) {
  const d = DB.getDeuda(id);
  if (d && !d.activa) showToast('Crédito completo: se archivó solo. Si fue un error, reactívalo desde su detalle');
}

function attachDeudaCardEvents(container) {
  container.querySelectorAll('[data-toggle-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleId;
      const pago = DB.getPago(id, currentMonth);
      DB.marcarPago(id, currentMonth, !(pago && pago.pagado));
      renderAll();
      avisarSiSeArchivo(id);
    });
  });
  container.querySelectorAll('[data-pagar-archivar-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.pagarArchivarId;
      DB.marcarPago(id, currentMonth, true);
      DB.archivarDeuda(id);
      renderAll();
      showToast('Última cuota pagada y deuda archivada');
    });
  });
  container.querySelectorAll('[data-archivar-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idArchivar = btn.dataset.archivarId;
      const pagoArchivar = DB.getPago(idArchivar, currentMonth);
      if (pagoArchivar && !pagoArchivar.pagado) DB.marcarPago(idArchivar, currentMonth, true);
      DB.archivarDeuda(idArchivar);
      renderAll();
      showToast('Deuda archivada');
    });
  });
  container.querySelectorAll('[data-open-id]').forEach(card => {
    const id = card.dataset.openId;
    const deuda = DB.getDeuda(id);
    if (deuda && deuda.fotoId) {
      Photos.getURL(deuda.fotoId).then(url => {
        if (!url) return;
        const iconEl = card.querySelector(`#deuda-icon-${id}`);
        if (iconEl) iconEl.innerHTML = `<img src="${url}">`;
      });
    }
    card.addEventListener('click', () => openDeudaDetail(card.dataset.openId));
  });
}

function openDeudaForm(deuda) {
  const editing = !!deuda;
  const d = deuda || { empresa: '', detalle: '', icono: '📌', tipo: 'recurrente', cuotasTotales: '', valorCuota: '', cuotasPagadasBase: 0, notas: '', fechaInicio: currentMonth, entidad: '' };
  const entidades = DB.getEntidades();
  const mesesInicio = [];
  for (let m = Utils.shiftMonth(Utils.monthKey(), -60); Utils.compareMonth(m, Utils.shiftMonth(Utils.monthKey(), 12)) <= 0; m = Utils.shiftMonth(m, 1)) mesesInicio.push(m);
  if (d.fechaInicio && !mesesInicio.includes(d.fechaInicio)) mesesInicio.push(d.fechaInicio);
  mesesInicio.sort();
  const empresas = DB.getEmpresas();
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
      <label>Empresa / Categoría</label>
      <select id="f-empresa">
        ${empresas.map(e => `<option value="${escapeAttr(e)}" ${e === d.empresa ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
        <option value="__nueva__" ${empresaEsNueva ? 'selected' : ''}>+ Nueva empresa…</option>
      </select>
      <input type="text" id="f-empresa-nueva" value="${empresaEsNueva ? escapeAttr(d.empresa) : ''}" placeholder="Nombre de la nueva empresa" style="margin-top:8px; ${empresaEsNueva ? '' : 'display:none'}">
    </div>
    <div class="form-group">
      <label>Tarjeta / entidad financiera (opcional)</label>
      <select id="f-entidad">
        <option value="">— Ninguna —</option>
        ${entidades.map(e => `<option value="${escapeAttr(e)}" ${e === d.entidad ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
        <option value="__nueva__">+ Nueva tarjeta / entidad…</option>
      </select>
      <input type="text" id="f-entidad-nueva" placeholder="Ej: BCI Visa, CMR Falabella" style="margin-top:8px; display:none">
      <p class="muted" style="margin:6px 0 0">Con qué tarjeta o banco se compró (útil en deudas de terceros).</p>
    </div>
    <div class="form-group">
      <label>Detalle</label>
      <input type="text" id="f-detalle" value="${escapeAttr(d.detalle)}" placeholder="Ej: Electricidad, Crédito auto...">
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
    <div class="form-group">
      <label>Mes de inicio de la deuda</label>
      <select id="f-fechaInicio">
        ${mesesInicio.map(m => `<option value="${m}" ${m === d.fechaInicio ? 'selected' : ''}>${Utils.monthLabel(m)}</option>`).join('')}
      </select>
      <p class="muted" style="margin:6px 0 0">Los meses anteriores a este no cuentan como deuda.</p>
    </div>
    <div class="form-group" id="f-cuotasPagadas-group" style="${d.tipo === 'cuotas' ? '' : 'display:none'}">
      <label>Cuotas ya pagadas antes del mes de inicio</label>
      <input type="number" id="f-cuotasPagadasBase" value="${d.cuotasPagadasBase || 0}">
    </div>
    <div class="form-group">
      <label>Notas (opcional)</label>
      <textarea id="f-notas">${escapeHtml(d.notas || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Foto (boleta, producto, contrato...)</label>
      <div class="photo-attach-row">
        <div id="previewFotoDeuda"><div class="photo-preview-empty">📷</div></div>
        <button type="button" class="btn-photo" id="btnTomarFotoDeuda">📷 Tomar / adjuntar foto</button>
        <input type="file" id="inputFotoDeuda" accept="image/*" capture="environment" hidden>
      </div>
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
      document.getElementById('f-cuotasPagadas-group').style.display = isCuotas ? '' : 'none';
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
  document.getElementById('f-entidad').addEventListener('change', (e) => {
    document.getElementById('f-entidad-nueva').style.display = e.target.value === '__nueva__' ? '' : 'none';
  });

  const btnGuardarDeuda = document.getElementById('btnGuardarDeuda');
  let fotoId = d.fotoId || null;
  if (fotoId) {
    Photos.getURL(fotoId).then(url => {
      if (!url) return;
      document.getElementById('previewFotoDeuda').innerHTML = `<img class="photo-preview" src="${url}">`;
      hacerAmpliable(document.getElementById('previewFotoDeuda').querySelector('img'));
    });
  }
  document.getElementById('btnTomarFotoDeuda').addEventListener('click', () => document.getElementById('inputFotoDeuda').click());
  document.getElementById('inputFotoDeuda').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    document.getElementById('previewFotoDeuda').innerHTML = `<img class="photo-preview" src="${localUrl}">`;
    hacerAmpliable(document.getElementById('previewFotoDeuda').querySelector('img'));
    const id = fotoId || Utils.uid();
    btnGuardarDeuda.disabled = true;
    await Photos.save(id, file);
    fotoId = id;
    btnGuardarDeuda.disabled = false;
  });

  document.getElementById('btnCancelarDeuda').addEventListener('click', closeSheet);
  btnGuardarDeuda.addEventListener('click', conBloqueoDoble(btnGuardarDeuda, () => {
    const empresaSel = document.getElementById('f-empresa').value;
    const empresa = empresaSel === '__nueva__' ? document.getElementById('f-empresa-nueva').value.trim() : empresaSel;
    const detalle = document.getElementById('f-detalle').value.trim();
    if (!empresa || !detalle) { showToast('Completa empresa y detalle'); return false; }
    const tipo = segmented.querySelector('button.active').dataset.tipo;
    const valorCuota = Utils.parseCLP(document.getElementById('f-valorCuota').value);
    const cuotasTotales = tipo === 'cuotas' ? (parseInt(document.getElementById('f-cuotasTotales').value, 10) || null) : null;
    const notas = document.getElementById('f-notas').value.trim();
    const icono = iconoSeleccionado;

    DB.addEmpresa(empresa);

    const entidadSel = document.getElementById('f-entidad').value;
    const entidad = entidadSel === '__nueva__' ? document.getElementById('f-entidad-nueva').value.trim() : entidadSel;
    if (entidad) DB.addEntidad(entidad);
    const fechaInicio = document.getElementById('f-fechaInicio').value;
    const cuotasPagadasBase = tipo === 'cuotas' ? (parseInt(document.getElementById('f-cuotasPagadasBase').value, 10) || 0) : 0;

    if (editing) {
      DB.updateDeuda(deuda.id, { empresa, detalle, icono, tipo, cuotasTotales, valorCuota, notas, fotoId, fechaInicio, cuotasPagadasBase, entidad });
      const pagoActual = DB.getPago(deuda.id, currentMonth);
      if (pagoActual && !pagoActual.pagado) {
        DB.upsertPago({ ...pagoActual, gasto: valorCuota });
      }
      DB.ensureDesdeInicio(deuda.id, Utils.monthKey());
      if (tipo === 'cuotas') DB.recalcularAcumulados(deuda.id);
      showToast('Deuda actualizada');
    } else {
      const nueva = DB.addDeuda({ empresa, detalle, icono, tipo, cuotasTotales, valorCuota, cuotasPagadasBase, fechaInicio, fotoId, entidad });
      DB.ensureDesdeInicio(nueva.id, Utils.monthKey());
      DB.ensureMes(currentMonth);
      showToast('Deuda agregada');
    }
    closeSheet();
    refreshCategoriaFilterOptions();
    renderMaestros();
    renderEntidades();
    renderAll();
  }));
}

function openDeudaDetail(id) {
  const deuda = DB.getDeuda(id);
  if (!deuda) return;
  // Solo desde el mes de inicio (antes la deuda no existía), salvo meses ya marcados pagados.
  const historial = DB.getPagosDeDeuda(id)
    .filter(p => p.pagado || !deuda.fechaInicio || Utils.compareMonth(p.mes, deuda.fechaInicio) >= 0);

  openSheet(`
    <h2>${escapeHtml(deuda.icono || '📌')} ${escapeHtml(deuda.detalle)}</h2>
    <p class="muted" style="margin-top:-10px">${escapeHtml(deuda.empresa)}${deuda.entidad ? ` · 💳 ${escapeHtml(deuda.entidad)}` : ''}${deuda.fechaInicio ? ` · desde ${Utils.monthLabel(deuda.fechaInicio)}` : ''}</p>
    ${!deuda.activa ? `<div class="form-group"><span class="badge-estado reembolsado">Archivada el ${formatFechaCorta(deuda.fechaArchivo.slice(0, 10))}</span></div>` : ''}
    ${deuda.fotoId ? `<div class="form-group"><div id="previewFotoDeudaDetalle"><div class="photo-preview-empty">📷</div></div></div>` : ''}
    <div class="sheet-actions">
      <button class="btn btn-secondary full" id="btnEditarDeuda">Editar datos</button>
      ${deuda.activa ? '<button class="btn btn-secondary full" id="btnArchivarDeuda">Archivar (cuenta saldada/cerrada)</button>' : '<button class="btn btn-secondary full" id="btnReactivarDeuda">Reactivar deuda</button>'}
    </div>
    <div class="section-block">
      <h2>Historial de pagos</h2>
      <p class="muted" style="margin:-4px 0 8px">Toca el estado de un mes para cambiarlo entre Pagado y Pendiente.</p>
      <div class="historial-list">
        ${historial.length ? historial.map(p => `
          <div class="historial-row">
            <span class="h-mes">${Utils.monthLabel(p.mes)}</span>
            <span>${Utils.formatCLP(p.gasto)}</span>
            <button class="estado-toggle ${p.pagado ? 'pagado' : 'pendiente'}" data-hist-mes="${p.mes}">${p.pagado ? '✓ Pagado' : 'Pendiente'}</button>
          </div>`).join('') : '<div class="empty-state">Sin historial aún</div>'}
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-danger full" id="btnEliminarDeuda">Eliminar deuda</button>
      <button class="btn btn-secondary full" id="btnCerrarDetalle">Cerrar</button>
    </div>
  `);

  if (deuda.fotoId) {
    Photos.getURL(deuda.fotoId).then(url => {
      if (!url) return;
      document.getElementById('previewFotoDeudaDetalle').innerHTML = `<img class="photo-preview" src="${url}">`;
      hacerAmpliable(document.getElementById('previewFotoDeudaDetalle').querySelector('img'));
    });
  }

  document.querySelectorAll('[data-hist-mes]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mes = btn.dataset.histMes;
      const pago = DB.getPago(id, mes);
      DB.marcarPago(id, mes, !(pago && pago.pagado));
      renderAll();
      openDeudaDetail(id);
      avisarSiSeArchivo(id);
    });
  });
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
    const pagoActual = DB.getPago(id, currentMonth);
    if (pagoActual && !pagoActual.pagado) DB.marcarPago(id, currentMonth, true);
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
  const btnGuardarIngreso = document.getElementById('btnGuardarIngreso');
  btnGuardarIngreso.addEventListener('click', conBloqueoDoble(btnGuardarIngreso, () => {
    const fuente = document.getElementById('f-fuente').value.trim();
    const monto = Utils.parseCLP(document.getElementById('f-monto').value);
    const tipo = seg.querySelector('button.active').dataset.tipo;
    if (!fuente || !monto) { showToast('Completa fuente y monto'); return false; }
    if (editing) {
      DB.updateIngreso(ingreso.id, { fuente, monto, tipo });
      showToast('Ingreso actualizado');
    } else {
      DB.addIngreso({ fuente, monto, tipo, mes: currentMonth });
      showToast('Ingreso agregado');
    }
    closeSheet();
    renderAll();
  }));
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
        if (!el) return;
        el.outerHTML = `<img id="thumb-${g.id}" class="gasto-thumb" src="${url}">`;
        hacerAmpliable(card.querySelector(`#thumb-${g.id}`));
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
      if (!url) return;
      document.getElementById('previewBoleta').innerHTML = `<img class="photo-preview" src="${url}">`;
      hacerAmpliable(document.getElementById('previewBoleta').querySelector('img'));
    });
  }

  const btnGuardarGasto = document.getElementById('btnGuardarGasto');
  document.getElementById('btnTomarBoleta').addEventListener('click', () => document.getElementById('inputBoleta').click());
  document.getElementById('inputBoleta').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    document.getElementById('previewBoleta').innerHTML = `<img class="photo-preview" src="${localUrl}">`;
    hacerAmpliable(document.getElementById('previewBoleta').querySelector('img'));
    const id = fotoBoletaId || Utils.uid();
    btnGuardarGasto.disabled = true;
    await Photos.save(id, file);
    fotoBoletaId = id;
    btnGuardarGasto.disabled = false;
  });

  document.getElementById('btnCancelarGasto').addEventListener('click', closeSheet);
  btnGuardarGasto.addEventListener('click', conBloqueoDoble(btnGuardarGasto, () => {
    const tipo = tipoSeg.querySelector('button.active').dataset.tipo;
    const esRendir = tipo === 'rendir';
    const detalle = document.getElementById('f-detalle').value.trim();
    const monto = Utils.parseCLP(document.getElementById('f-monto').value);
    const fecha = document.getElementById('f-fecha').value || new Date().toISOString().slice(0, 10);
    const notas = document.getElementById('f-notas').value.trim();
    const categoria = esRendir ? 'Gasto Empresa' : document.getElementById('f-categoria').value;
    if (!detalle || !monto) { showToast('Completa detalle y monto'); return false; }

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
  }));
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
      if (!url) return;
      document.getElementById('previewBoletaDet').innerHTML = `<img class="photo-preview" src="${url}">`;
      hacerAmpliable(document.getElementById('previewBoletaDet').querySelector('img'));
    });
  }
  if (gasto.fotoComprobanteId) {
    Photos.getURL(gasto.fotoComprobanteId).then(url => {
      if (!url) return;
      document.getElementById('previewComprobanteDet').innerHTML = `<img class="photo-preview" src="${url}">`;
      hacerAmpliable(document.getElementById('previewComprobanteDet').querySelector('img'));
    });
  }

  document.getElementById('btnTomarBoletaDet').addEventListener('click', () => document.getElementById('inputBoletaDet').click());
  document.getElementById('inputBoletaDet').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('previewBoletaDet').innerHTML = `<img class="photo-preview" src="${URL.createObjectURL(file)}">`;
    hacerAmpliable(document.getElementById('previewBoletaDet').querySelector('img'));
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
    hacerAmpliable(document.getElementById('previewComprobanteDet').querySelector('img'));
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

// ---------- INFORMES (Excel) ----------
function generarInformeExcel() {
  const deudas = DB.getDeudas();
  const pagos = DB.getPagos();
  const ingresos = DB.getIngresos();
  const gastos = DB.getGastos();

  const meses = new Set([
    ...ingresos.map(i => i.mes),
    ...pagos.map(p => p.mes),
    ...gastos.map(g => g.fecha.slice(0, 7)),
  ]);
  const mesesOrdenados = [...meses].sort();

  const hojaResumen = {
    nombre: 'Resumen Mensual',
    encabezados: ['Mes', 'Ingresos', 'Gastos', 'Saldo Inicial', 'Balance', 'Cerrado', 'Saldo Trasladado'],
    filas: mesesOrdenados.map(mes => {
      const ingresosTotal = DB.getIngresosDeMes(mes).reduce((s, i) => s + Number(i.monto), 0);
      const gastosTotal = DB.getPagosDeMes(mes).reduce((s, p) => s + Number(p.gasto), 0);
      const saldoInicial = DB.getSaldoInicial(mes);
      const balance = saldoInicial + ingresosTotal - gastosTotal;
      const cierre = DB.getCierre(mes);
      return [
        Utils.monthLabel(mes), ingresosTotal, gastosTotal, saldoInicial, balance,
        cierre ? 'Sí' : 'No', cierre ? Math.max(0, cierre.saldoFinal) : 0,
      ];
    }),
  };

  const hojaDeudas = {
    nombre: 'Deudas',
    encabezados: ['Empresa', 'Tarjeta / Entidad', 'Detalle', 'Tipo', 'Cuotas Totales', 'Valor Cuota', 'Cuotas Pagadas (base)', 'Estado', 'Fecha Archivo'],
    filas: deudas.map(d => [
      d.empresa, d.entidad || '', d.detalle, d.tipo === 'cuotas' ? 'Crédito en cuotas' : 'Gasto recurrente',
      d.cuotasTotales ?? '', d.valorCuota, d.cuotasPagadasBase ?? 0,
      d.activa ? 'Activa' : 'Archivada', d.fechaArchivo ? d.fechaArchivo.slice(0, 10) : '',
    ]),
  };

  const hojaPagos = {
    nombre: 'Historial de Pagos',
    encabezados: ['Mes', 'Empresa', 'Detalle', 'Gasto', 'Pagado', 'Fecha de Pago', 'Cuota Acumulada'],
    filas: pagos
      .slice()
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map(p => {
        const d = deudas.find(x => x.id === p.deudaId);
        return [
          p.mes, d ? d.empresa : '', d ? d.detalle : '', p.gasto,
          p.pagado ? 'Sí' : 'No', p.fechaPago ? p.fechaPago.slice(0, 10) : '',
          p.cuotaPagadaAcumulada ?? '',
        ];
      }),
  };

  const hojaIngresos = {
    nombre: 'Ingresos',
    encabezados: ['Mes', 'Fuente', 'Monto', 'Tipo', 'Notas'],
    filas: ingresos.map(i => [i.mes, i.fuente, i.monto, i.tipo, i.notas || '']),
  };

  const hojaConsumo = {
    nombre: 'Gastos - Consumo',
    encabezados: ['Fecha', 'Detalle', 'Monto', 'Categoría', 'Notas'],
    filas: gastos.filter(g => g.tipo === 'consumo').map(g => [g.fecha, g.detalle, g.monto, g.categoria, g.notas || '']),
  };

  const hojaRendir = {
    nombre: 'Gastos - Por Rendir',
    encabezados: ['Fecha', 'Detalle', 'Monto', 'Estado', 'Fecha Rendido', 'Fecha Reembolso'],
    filas: gastos.filter(g => g.tipo === 'rendir').map(g => [
      g.fecha, g.detalle, g.monto, g.estado,
      g.fechaRendido ? g.fechaRendido.slice(0, 10) : '',
      g.fechaReembolso ? g.fechaReembolso.slice(0, 10) : '',
    ]),
  };

  XlsxWriter.descargar(
    [hojaResumen, hojaDeudas, hojaPagos, hojaIngresos, hojaConsumo, hojaRendir],
    `finanzas-informe-${Utils.monthKey()}.xlsx`
  );
}

// ---------- INFORMES (PDF por mes y empresa) ----------
function empresasConDeudas() {
  return [...new Set(DB.getDeudas().filter(d => d.activa).map(d => d.empresa || 'Otros'))].sort((a, b) => a.localeCompare(b));
}

// Una fila por deuda que tenga registro de pago en ese mes, agrupadas por empresa.
function filasInformeMes(mes, empresasSel) {
  const deudas = DB.getDeudas();
  const sel = new Set(empresasSel);
  const grupos = {};
  DB.getPagosDeMes(mes).forEach(pago => {
    const deuda = deudas.find(d => d.id === pago.deudaId);
    if (!deuda || !deuda.activa) return; // el informe solo incluye deudas activas
    const empresa = deuda.empresa || 'Otros';
    if (!sel.has(empresa)) return;
    const esCuotas = deuda.tipo === 'cuotas';
    const pagadas = esCuotas ? DB.cuotasPagadasHasta(deuda.id, mes) : null;
    const monto = Number(pago.gasto);
    // Crédito cuyas cuotas ya estaban todas pagadas antes de este mes: no debe nada, no aparece.
    if (esCuotas && deuda.cuotasTotales != null && !pago.pagado
        && DB.cuotaAcumuladaAntesDe(deuda.id, mes) >= deuda.cuotasTotales) return;
    const estado = pago.pagado ? 'Pagado' : 'Pendiente';
    if (!grupos[empresa]) grupos[empresa] = [];
    grupos[empresa].push({
      detalle: deuda.detalle,
      entidad: deuda.entidad || '',
      monto,
      pagado: !!pago.pagado,
      cuotas: esCuotas ? `${pagadas}/${deuda.cuotasTotales ?? '?'}` : 'Recurrente',
      estado,
      color: pago.pagado ? [0.1, 0.55, 0.25] : [0.8, 0.15, 0.15],
    });
  });
  Object.values(grupos).forEach(filas => filas.sort((a, b) => a.detalle.localeCompare(b.detalle)));
  return grupos;
}

function generarInformePdf(mes, empresasSel, todasLasEmpresas) {
  const grupos = filasInformeMes(mes, empresasSel);
  const nombresEmpresa = Object.keys(grupos).sort((a, b) => a.localeCompare(b));
  const todas = nombresEmpresa.flatMap(e => grupos[e]);
  const total = todas.reduce((s, f) => s + f.monto, 0);
  const pagado = todas.filter(f => f.pagado).reduce((s, f) => s + f.monto, 0);

  const doc = new PdfDoc();
  const M = 40;
  const FILA = 18;
  const GRIS = [0.45, 0.45, 0.5];
  const col = { detalle: M + 8, entidad: M + 158, montoDer: M + 326, cuotasCentro: M + 378, estado: M + 428 };
  const limiteY = doc.alto - 50;
  let y = 56;

  doc.texto(M, y, 'Informe de deudas', { size: 20, bold: true });
  y += 22;
  doc.texto(M, y, Utils.monthLabel(mes), { size: 13, bold: true, color: [0.3, 0.2, 0.6] });
  y += 16;
  const textoEmpresas = todasLasEmpresas ? 'Todas las empresas' : `Empresas: ${empresasSel.join(', ')}`;
  doc.texto(M, y, doc.ajustar(textoEmpresas, 515, 9.5, false), { size: 9.5, color: GRIS });
  y += 13;
  const hoy = new Date();
  doc.texto(M, y, `Generado el ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`, { size: 9.5, color: GRIS });
  y += 22;

  const cajas = [
    ['Total del mes', total, [0.2, 0.2, 0.25]],
    ['Pagado', pagado, [0.1, 0.55, 0.25]],
    ['Pendiente', total - pagado, [0.8, 0.15, 0.15]],
  ];
  const anchoCaja = (515 - 2 * 12) / 3;
  cajas.forEach(([titulo, valor, color], i) => {
    const x = M + i * (anchoCaja + 12);
    doc.rect(x, y, anchoCaja, 46);
    doc.texto(x + 10, y + 16, titulo, { size: 9, color: GRIS });
    doc.texto(x + 10, y + 36, Utils.formatCLP(valor), { size: 15, bold: true, color });
  });
  y += 46 + 8;
  doc.texto(M, y + 8, `${todas.length} deuda${todas.length === 1 ? '' : 's'} en este informe`, { size: 9, color: GRIS });
  y += 26;

  function encabezadoTabla() {
    doc.rect(M, y, 515, FILA, { relleno: [0.82, 0.82, 0.9] });
    const t = { size: 8.5, bold: true };
    doc.texto(col.detalle, y + 12.5, 'DETALLE', t);
    doc.texto(col.entidad, y + 12.5, 'TARJETA / ENTIDAD', t);
    doc.texto(col.montoDer, y + 12.5, 'MONTO', { ...t, align: 'right' });
    doc.texto(col.cuotasCentro, y + 12.5, 'CUOTAS PAGADAS', { ...t, align: 'center' });
    doc.texto(col.estado, y + 12.5, 'ESTADO', t);
    y += FILA;
  }
  function asegurar(alto) {
    if (y + alto <= limiteY) return;
    doc.nuevaPagina();
    y = 50;
    encabezadoTabla();
  }

  if (todas.length === 0) {
    doc.texto(M, y + 10, 'No hay deudas registradas para ese mes y esas empresas.', { size: 11, color: GRIS });
  } else {
    encabezadoTabla();
    nombresEmpresa.forEach(empresa => {
      const filas = grupos[empresa];
      asegurar(FILA * 2 + 8);
      const subtotal = filas.reduce((s, f) => s + f.monto, 0);
      doc.rect(M, y + 4, 515, FILA, { relleno: [0.94, 0.93, 0.98] });
      doc.texto(col.detalle, y + 4 + 12.5, empresa, { size: 10, bold: true });
      doc.texto(col.montoDer, y + 4 + 12.5, Utils.formatCLP(subtotal), { size: 10, bold: true, align: 'right' });
      y += FILA + 4;
      filas.forEach(f => {
        asegurar(FILA);
        doc.texto(col.detalle, y + 12.5, doc.ajustar(f.detalle, 144, 9.5, false), { size: 9.5 });
        doc.texto(col.entidad, y + 12.5, f.entidad ? doc.ajustar(f.entidad, 110, 9.5, false) : '-', { size: 9.5, color: f.entidad ? [0, 0, 0] : GRIS });
        doc.texto(col.montoDer, y + 12.5, Utils.formatCLP(f.monto), { size: 9.5, align: 'right' });
        doc.texto(col.cuotasCentro, y + 12.5, f.cuotas, { size: 9.5, align: 'center', color: f.cuotas === 'Recurrente' ? GRIS : [0, 0, 0] });
        doc.texto(col.estado, y + 12.5, doc.ajustar(f.estado, 85, 9.5, true), { size: 9.5, bold: true, color: f.color });
        doc.linea(M, y + FILA, M + 515, y + FILA);
        y += FILA;
      });
      y += 4;
    });
  }

  return doc.generar('Finanzas Familiares');
}

function abrirInformePdf() {
  const empresas = empresasConDeudas();
  const meses = [...new Set([currentMonth, Utils.monthKey(), ...DB.getPagos().map(p => p.mes)])].sort().reverse();
  if (empresas.length === 0) { showToast('Aún no hay deudas para armar un informe'); return; }

  openSheet(`
    <h2>Informe PDF</h2>
    <p class="muted" style="margin-top:-10px">Elige el mes y las empresas que quieres incluir.</p>
    <div class="form-group">
      <label>Mes</label>
      <select id="pdf-mes">
        ${meses.map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${Utils.monthLabel(m)}</option>`).join('')}
      </select>
    </div>
    <div class="check-list">
      <div class="check-list-title">Empresas</div>
      <label class="check-row"><input type="checkbox" id="pdf-todas" checked> <strong>Todas</strong></label>
      ${empresas.map(e => `<label class="check-row"><input type="checkbox" class="pdf-emp" value="${escapeAttr(e)}" checked> ${escapeHtml(e)}</label>`).join('')}
    </div>
    <p class="muted" id="pdf-resumen"></p>
    <div class="sheet-actions">
      <button class="btn btn-primary full" id="btnGenerarPdf">Generar PDF</button>
      <button class="btn btn-secondary full" id="btnCancelarPdf">Cancelar</button>
    </div>
  `);

  const checks = [...document.querySelectorAll('.pdf-emp')];
  const todasChk = document.getElementById('pdf-todas');
  const seleccionadas = () => checks.filter(c => c.checked).map(c => c.value);
  const actualizarResumen = () => {
    const mes = document.getElementById('pdf-mes').value;
    const sel = seleccionadas();
    const grupos = filasInformeMes(mes, sel);
    const filas = Object.values(grupos).flat();
    const total = filas.reduce((s, f) => s + f.monto, 0);
    document.getElementById('pdf-resumen').textContent = sel.length === 0
      ? 'Selecciona al menos una empresa.'
      : filas.length === 0
        ? 'No hay deudas registradas ese mes en las empresas elegidas.'
        : `${filas.length} deuda${filas.length === 1 ? '' : 's'} · ${Utils.formatCLP(total)}`;
    document.getElementById('btnGenerarPdf').disabled = filas.length === 0;
  };
  todasChk.addEventListener('change', () => {
    checks.forEach(c => { c.checked = todasChk.checked; });
    actualizarResumen();
  });
  checks.forEach(c => c.addEventListener('change', () => {
    todasChk.checked = checks.every(x => x.checked);
    actualizarResumen();
  }));
  document.getElementById('pdf-mes').addEventListener('change', actualizarResumen);
  document.getElementById('btnCancelarPdf').addEventListener('click', closeSheet);
  document.getElementById('btnGenerarPdf').addEventListener('click', () => {
    const mes = document.getElementById('pdf-mes').value;
    const sel = seleccionadas();
    try {
      const blob = generarInformePdf(mes, sel, sel.length === empresas.length);
      PdfWriter.entregar(blob, `informe-deudas-${mes}.pdf`);
      closeSheet();
    } catch (e) {
      console.error(e);
      showToast('No se pudo generar el PDF');
    }
  });
  actualizarResumen();
}

// ---------- Revisión de cuotas pagadas ----------
function abrirRevisionCuotas() {
  const hoyMes = Utils.monthKey();
  const deudas = DB.getDeudas().filter(d => d.tipo === 'cuotas')
    .sort((a, b) => (a.empresa + a.detalle).localeCompare(b.empresa + b.detalle));

  const bloques = deudas.map(d => {
    const pagos = DB.getPagosDeDeuda(d.id);
    const pagadasTotal = DB.cuotasPagadasHasta(d.id, '9999-12');
    const base = d.cuotasPagadasBase || 0;
    const filas = pagos.map(p => {
      const acum = DB.cuotasPagadasHasta(d.id, p.mes);
      const antesDeEmpezar = !p.pagado && Utils.compareMonth(p.mes, d.fechaInicio) < 0;
      const olvidado = !p.pagado && !antesDeEmpezar && Utils.compareMonth(p.mes, hoyMes) < 0 && Number(p.gasto) > 0;
      return `<div class="historial-row">
        <span class="h-mes">${Utils.monthLabel(p.mes)}</span>
        <span class="${p.pagado ? 'rev-ok' : (olvidado ? 'rev-warn' : '')}">${p.pagado ? '✓ Pagado' : (antesDeEmpezar ? 'Antes de empezar' : (olvidado ? '⚠ Sin marcar' : 'Pendiente'))} · ${acum}/${d.cuotasTotales ?? '?'}</span>
        ${(p.pagado || !antesDeEmpezar) ? `<button class="btn-mini" data-rev-pagar="${d.id}|${p.mes}">${p.pagado ? 'Desmarcar' : 'Marcar pagado'}</button>` : ''}
      </div>`;
    }).join('');
    return `<div class="section-block">
      <h2>${escapeHtml(d.icono || '📌')} ${escapeHtml(d.empresa)} · ${escapeHtml(d.detalle)}${d.activa ? '' : ' (archivada)'}</h2>
      <p class="muted" style="margin:-4px 0 8px">${pagadasTotal}/${d.cuotasTotales ?? '?'} cuotas pagadas${base > 0 ? ` · ya llevabas ${base} pagadas antes de ${Utils.monthLabel(d.fechaInicio)}` : ''}</p>
      <div class="historial-list">${filas || '<div class="empty-state">Sin meses registrados.</div>'}</div>
    </div>`;
  }).join('');

  openSheet(`
    <h2>Revisión de cuotas</h2>
    <p class="muted" style="margin-top:-10px">Cada mes marcado como <strong>Pagado</strong> suma una cuota. Puedes marcar o
      desmarcar cualquier mes desde aquí (o desde el detalle de cada deuda).</p>
    ${bloques || '<div class="empty-state">No tienes créditos en cuotas.</div>'}
    <div class="sheet-actions"><button class="btn btn-secondary full" id="btnCerrarRevision">Cerrar</button></div>
  `);
  document.getElementById('btnCerrarRevision').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-rev-pagar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [id, mes] = btn.dataset.revPagar.split('|');
      const pago = DB.getPago(id, mes);
      const pagar = !(pago && pago.pagado);
      DB.marcarPago(id, mes, pagar);
      renderAll();
      abrirRevisionCuotas();
      showToast(pagar ? 'Cuota marcada como pagada' : 'Cuota marcada como pendiente');
      avisarSiSeArchivo(id);
    });
  });
}

// ---------- AJUSTES ----------
function renderUltimoRespaldo() {
  const info = DB.getMeta().ultimoRespaldo;
  const el = document.getElementById('ultimoRespaldoInfo');
  if (!info) { el.textContent = 'Aún no has exportado ni importado ningún respaldo.'; return; }
  const fecha = new Date(info.fecha);
  const fechaTexto = `${formatFechaCorta(fecha.toISOString().slice(0, 10))} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
  el.textContent = `Último ${info.tipo}: ${info.nombre} — ${fechaTexto}`;
}

function wireAjustes() {
  renderUltimoRespaldo();

  Auth.getSession().then(session => {
    document.getElementById('cuentaInfo').textContent = session ? `Sesión iniciada como ${session.user.email}` : '';
  });
  document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión? Tendrás que volver a ingresar tu correo y contraseña.')) {
      await Auth.logout();
      location.reload();
    }
  });

  document.getElementById('btnExportarExcel').addEventListener('click', () => {
    try {
      generarInformeExcel();
      showToast('Informe exportado');
    } catch (e) {
      console.error(e);
      showToast('No se pudo generar el informe');
    }
  });

  document.getElementById('btnInformePdf').addEventListener('click', abrirInformePdf);
  document.getElementById('btnRevisarCuotas').addEventListener('click', abrirRevisionCuotas);

  document.getElementById('btnExport').addEventListener('click', () => {
    const nombre = `finanzas-respaldo-${Utils.monthKey()}.json`;
    const data = DB.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
    DB.setMeta({ ultimoRespaldo: { tipo: 'exportado', nombre, fecha: new Date().toISOString() } });
    renderUltimoRespaldo();
  });

  document.getElementById('inputImport').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        DB.importAll(reader.result);
        DB.setMeta({ ultimoRespaldo: { tipo: 'importado', nombre: file.name, fecha: new Date().toISOString() } });
        showToast('Respaldo importado');
        renderUltimoRespaldo();
        renderAll();
      } catch (err) {
        showToast('Archivo inválido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btnReset').addEventListener('click', async () => {
    if (confirm('Esto borrará TODOS los datos en la nube (afecta a cualquiera que use esta cuenta, no solo este dispositivo). ¿Continuar?')) {
      try {
        await DB.resetAll();
        DB.seedIfEmpty();
        currentMonth = DB.getMeta().mesActual || Utils.monthKey();
        renderAll();
        renderLockUi();
        renderUltimoRespaldo();
        showToast('Datos reiniciados');
      } catch (e) {
        console.error(e);
        showToast('No se pudo borrar todo (revisa tu conexión) — intenta de nuevo');
      }
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
  const btnPromptGuardar = document.getElementById('btnPromptGuardar');
  const guardar = conBloqueoDoble(btnPromptGuardar, () => {
    const val = input.value.trim();
    if (!val) { showToast('Escribe un nombre'); return false; }
    onGuardar(val);
    closeSheet();
  });
  btnPromptGuardar.addEventListener('click', guardar);
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
        refreshCategoriaFilterOptions();
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
        refreshCategoriaFilterOptions();
        showToast('Empresa quitada de la lista');
      }
    });
  });
}

function renderEntidades() {
  const el = document.getElementById('entidadesList');
  const entidades = DB.getEntidades();
  el.innerHTML = entidades.length ? entidades.map(e => `
    <div class="maestro-row">
      <span>${escapeHtml(e)}</span>
      <div class="maestro-actions">
        <button class="icon-action" data-edit-entidad="${escapeAttr(e)}">✎</button>
        <button class="icon-action" data-del-entidad="${escapeAttr(e)}">✕</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state">Aún no tienes tarjetas o entidades registradas.</div>';

  el.querySelectorAll('[data-edit-entidad]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.editEntidad;
      openTextPrompt('Renombrar tarjeta / entidad', nombre, (nuevo) => {
        DB.renameEntidad(nombre, nuevo);
        renderEntidades();
        renderAll();
        showToast('Tarjeta / entidad actualizada');
      });
    });
  });
  el.querySelectorAll('[data-del-entidad]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.delEntidad;
      if (confirm(`¿Quitar "${nombre}" de la lista? Las deudas que ya la usan no se modifican.`)) {
        DB.deleteEntidad(nombre);
        renderEntidades();
        showToast('Quitada de la lista');
      }
    });
  });
}

function wireMaestros() {
  document.getElementById('btnAgregarEntidad').addEventListener('click', () => {
    openTextPrompt('Nueva tarjeta / entidad', '', (nombre) => {
      DB.addEntidad(nombre);
      renderEntidades();
      showToast('Tarjeta / entidad agregada');
    });
  });
  renderEntidades();
  document.getElementById('btnAgregarEmpresa').addEventListener('click', () => {
    openTextPrompt('Nueva empresa', '', (nombre) => {
      DB.addEmpresa(nombre);
      renderMaestros();
      refreshCategoriaFilterOptions();
      showToast('Empresa agregada');
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
    if (confirm('Esto quita el PIN y Face ID/Touch ID de este dispositivo (tus datos no se tocan, siguen en la nube). Podrás activarlos de nuevo desde Ajustes. ¿Continuar?')) {
      Lock.disable();
      Biometric.disable();
      Lock.hideOverlay();
      init();
      showToast('Bloqueo local desactivado');
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
  const bloqueoTimeoutSelect = document.getElementById('bloqueoTimeoutSelect');
  bloqueoTimeoutSelect.value = String(DB.getMeta().bloqueoTimeoutSeg ?? 60);
  bloqueoTimeoutSelect.addEventListener('change', () => {
    DB.setMeta({ bloqueoTimeoutSeg: parseInt(bloqueoTimeoutSelect.value, 10) });
    showToast('Preferencia guardada');
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
  document.getElementById('bloqueoTimeoutGroup').classList.toggle('hidden', !protegida());

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
  const btnGuardarPin = document.getElementById('btnGuardarPin');
  btnGuardarPin.addEventListener('click', conBloqueoDoble(btnGuardarPin, async () => {
    const p1 = document.getElementById('f-pin1').value;
    const p2 = document.getElementById('f-pin2').value;
    if (p1.length !== Lock.PIN_LARGO || p1 !== p2) {
      document.getElementById('pinFormError').classList.remove('hidden');
      return false;
    }
    await Lock.setPin(p1);
    closeSheet();
    renderLockUi();
    showToast(cambiando ? 'PIN actualizado' : 'Bloqueo activado');
  }));
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
