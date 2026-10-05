// core.js — capa de datos. Los datos financieros (deudas, pagos, ingresos, gastos,
// empresas, cierres) viven en Supabase (Postgres) y se comparten entre todos los
// dispositivos con sesión iniciada; "meta" (tema, mes actual, preferencias de
// bloqueo) es deliberadamente local a cada dispositivo, vía localStorage, porque no
// tiene sentido compartirla entre personas o equipos.
//
// El resto de la app (app.js) sigue llamando a DB.getDeudas(), DB.addDeuda(), etc.
// exactamente igual que antes: la lectura es síncrona (lee de una caché en memoria
// ya cargada al iniciar sesión) y cada escritura además dispara una sincronización
// en segundo plano hacia Supabase, avisando con un toast si falla por conexión.

const STORAGE_KEYS = {
  meta: 'ff_meta_v1',
};

const CATEGORIAS_CONSUMO = [
  'Comida',
  'Transporte',
  'Entretención',
  'Salud',
  'Hogar',
  'Otros',
];

// Estados posibles de un gasto "por rendir" (a la empresa).
const ESTADOS_RENDIR = ['pendiente', 'rendido', 'reembolsado'];

const Utils = {
  uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  },
  formatCLP(n) {
    const v = Number(n) || 0;
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
  },
  parseCLP(str) {
    if (typeof str === 'number') return str;
    const clean = String(str).replace(/[^\d-]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  },
  monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  },
  monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${nombres[m - 1]} ${y}`;
  },
  shiftMonth(key, delta) {
    let [y, m] = key.split('-').map(Number);
    m += delta;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    return `${y}-${String(m).padStart(2, '0')}`;
  },
  compareMonth(a, b) {
    return a.localeCompare(b);
  },
};

// ---------- Conversión camelCase (JS) <-> snake_case (columnas Postgres) ----------
function deudaToRow(d) {
  return {
    id: d.id, empresa: d.empresa, detalle: d.detalle, icono: d.icono, tipo: d.tipo,
    cuotas_totales: d.cuotasTotales, valor_cuota: d.valorCuota, cuotas_pagadas_base: d.cuotasPagadasBase,
    fecha_inicio: d.fechaInicio, activa: d.activa, fecha_archivo: d.fechaArchivo, notas: d.notas,
    foto_id: d.fotoId, creado_en: d.creadoEn,
  };
}
function rowToDeuda(r) {
  return {
    id: r.id, empresa: r.empresa, detalle: r.detalle, icono: r.icono, tipo: r.tipo,
    cuotasTotales: r.cuotas_totales, valorCuota: Number(r.valor_cuota), cuotasPagadasBase: r.cuotas_pagadas_base,
    fechaInicio: r.fecha_inicio, activa: r.activa, fechaArchivo: r.fecha_archivo, notas: r.notas || '',
    fotoId: r.foto_id, creadoEn: r.creado_en,
  };
}
function pagoToRow(p) {
  return {
    id: p.id, deuda_id: p.deudaId, mes: p.mes, gasto: p.gasto,
    cuota_pagada_acumulada: p.cuotaPagadaAcumulada, pagado: p.pagado, fecha_pago: p.fechaPago,
  };
}
function rowToPago(r) {
  return {
    id: r.id, deudaId: r.deuda_id, mes: r.mes, gasto: Number(r.gasto),
    cuotaPagadaAcumulada: r.cuota_pagada_acumulada, pagado: r.pagado, fechaPago: r.fecha_pago,
  };
}
function ingresoToRow(i) {
  return { id: i.id, fuente: i.fuente, monto: i.monto, mes: i.mes, tipo: i.tipo, notas: i.notas };
}
function rowToIngreso(r) {
  return { id: r.id, fuente: r.fuente, monto: Number(r.monto), mes: r.mes, tipo: r.tipo, notas: r.notas || '' };
}
function gastoToRow(g) {
  return {
    id: g.id, tipo: g.tipo, detalle: g.detalle, monto: g.monto, fecha: g.fecha, categoria: g.categoria,
    notas: g.notas, foto_boleta_id: g.fotoBoletaId, estado: g.estado, fecha_rendido: g.fechaRendido,
    fecha_reembolso: g.fechaReembolso, foto_comprobante_id: g.fotoComprobanteId, creado_en: g.creadoEn,
  };
}
function rowToGasto(r) {
  return {
    id: r.id, tipo: r.tipo, detalle: r.detalle, monto: Number(r.monto), fecha: r.fecha, categoria: r.categoria,
    notas: r.notas || '', fotoBoletaId: r.foto_boleta_id, estado: r.estado, fechaRendido: r.fecha_rendido,
    fechaReembolso: r.fecha_reembolso, fotoComprobanteId: r.foto_comprobante_id, creadoEn: r.creado_en,
  };
}
function cierreToRow(c) {
  return { mes: c.mes, saldo_final: c.saldoFinal, fecha_cierre: c.fechaCierre, ajustado: c.ajustado, fecha_ajuste: c.fechaAjuste };
}
function rowToCierre(r) {
  return { mes: r.mes, saldoFinal: Number(r.saldo_final), fechaCierre: r.fecha_cierre, ajustado: r.ajustado, fechaAjuste: r.fecha_ajuste };
}

// Ejecuta una escritura hacia Supabase en segundo plano; si falla (sin conexión,
// etc.) avisa con un toast pero no revierte la caché local ni bloquea al usuario.
function sincronizar(promesa, contexto) {
  promesa.then(({ error }) => {
    if (error) {
      console.error(contexto, error);
      if (typeof showToast === 'function') showToast('No se pudo sincronizar con la nube (revisa tu conexión)');
    }
  }).catch((e) => {
    console.error(contexto, e);
    if (typeof showToast === 'function') showToast('No se pudo sincronizar con la nube (revisa tu conexión)');
  });
}

const DB = {
  _cache: { deudas: [], pagos: [], ingresos: [], gastos: [], empresas: [], cierres: [] },

  // Carga completa desde Supabase — se llama una vez al iniciar sesión, antes de
  // mostrar cualquier dato. Lanza si falla (el llamador debe mostrar "sin conexión").
  async cargarTodoDesdeSupabase() {
    const [rd, rp, ri, rg, re, rc] = await Promise.all([
      supabaseClient.from('deudas').select('*'),
      supabaseClient.from('pagos').select('*'),
      supabaseClient.from('ingresos').select('*'),
      supabaseClient.from('gastos').select('*'),
      supabaseClient.from('empresas').select('*'),
      supabaseClient.from('cierres').select('*'),
    ]);
    for (const r of [rd, rp, ri, rg, re, rc]) if (r.error) throw r.error;
    this._cache.deudas = rd.data.map(rowToDeuda);
    this._cache.pagos = rp.data.map(rowToPago);
    this._cache.ingresos = ri.data.map(rowToIngreso);
    this._cache.gastos = rg.data.map(rowToGasto);
    this._cache.empresas = re.data.map(r => r.nombre).sort((a, b) => a.localeCompare(b));
    this._cache.cierres = rc.data.map(rowToCierre);
  },

  // ---------- Deudas ----------
  getDeudas() { return [...this._cache.deudas]; },
  saveDeudas(list) {
    const antes = new Set(this._cache.deudas.map(d => d.id));
    const ahora = new Set(list.map(d => d.id));
    this._cache.deudas = list;
    const aBorrar = [...antes].filter(id => !ahora.has(id));
    if (aBorrar.length) sincronizar(supabaseClient.from('deudas').delete().in('id', aBorrar), 'saveDeudas:delete');
    if (list.length) sincronizar(supabaseClient.from('deudas').upsert(list.map(deudaToRow)), 'saveDeudas:upsert');
  },
  getDeuda(id) { return this._cache.deudas.find(d => d.id === id) || null; },
  addDeuda(deuda) {
    const nueva = {
      id: Utils.uid(), empresa: '', detalle: '', icono: '📌', tipo: 'recurrente',
      cuotasTotales: null, valorCuota: 0, cuotasPagadasBase: 0, fechaInicio: Utils.monthKey(),
      activa: true, fechaArchivo: null, notas: '', fotoId: null, creadoEn: new Date().toISOString(),
      ...deuda,
    };
    this._cache.deudas.push(nueva);
    sincronizar(supabaseClient.from('deudas').insert(deudaToRow(nueva)), 'addDeuda');
    return nueva;
  },
  updateDeuda(id, patch) {
    const idx = this._cache.deudas.findIndex(d => d.id === id);
    if (idx === -1) return null;
    this._cache.deudas[idx] = { ...this._cache.deudas[idx], ...patch };
    sincronizar(supabaseClient.from('deudas').update(deudaToRow(this._cache.deudas[idx])).eq('id', id), 'updateDeuda');
    return this._cache.deudas[idx];
  },
  deleteDeuda(id) {
    const deuda = this.getDeuda(id);
    this._cache.deudas = this._cache.deudas.filter(d => d.id !== id);
    this._cache.pagos = this._cache.pagos.filter(p => p.deudaId !== id);
    sincronizar(supabaseClient.from('deudas').delete().eq('id', id), 'deleteDeuda');
    if (deuda && deuda.fotoId && typeof Photos !== 'undefined') Photos.delete(deuda.fotoId);
  },
  getDeudasArchivadas() {
    return this.getDeudas().filter(d => !d.activa).sort((a, b) => (b.fechaArchivo || '').localeCompare(a.fechaArchivo || ''));
  },
  archivarDeuda(id) {
    const r = this.updateDeuda(id, { activa: false, fechaArchivo: new Date().toISOString() });
    // Lo archivado se da por pagado (cuenta saldada/cerrada).
    this.liquidarArchivadas(id);
    this.recalcularAcumulados(id);
    return r;
  },
  reactivarDeuda(id) {
    return this.updateDeuda(id, { activa: true, fechaArchivo: null });
  },

  // ---------- Maestro de Empresas ----------
  getEmpresas() {
    const enUso = [...new Set(this._cache.deudas.map(d => d.empresa).filter(Boolean))];
    const combinado = Array.from(new Set([...this._cache.empresas, ...enUso])).sort((a, b) => a.localeCompare(b));
    return combinado;
  },
  saveEmpresas(list) {
    const clean = Array.from(new Set(list.filter(Boolean)));
    const antes = new Set(this._cache.empresas);
    const ahora = new Set(clean);
    this._cache.empresas = clean.sort((a, b) => a.localeCompare(b));
    const aBorrar = [...antes].filter(n => !ahora.has(n));
    if (aBorrar.length) sincronizar(supabaseClient.from('empresas').delete().in('nombre', aBorrar), 'saveEmpresas:delete');
    if (clean.length) sincronizar(supabaseClient.from('empresas').upsert(clean.map(nombre => ({ nombre }))), 'saveEmpresas:upsert');
  },
  addEmpresa(nombre) {
    nombre = (nombre || '').trim();
    if (!nombre) return;
    const list = this.getEmpresas();
    if (!list.includes(nombre)) this.saveEmpresas([...list, nombre]);
  },
  renameEmpresa(oldName, newName) {
    newName = (newName || '').trim();
    const list = this.getEmpresas();
    if (!newName || oldName === newName || !list.includes(oldName)) return;
    this.saveEmpresas([...list.filter(e => e !== oldName), newName]);
    this.saveDeudas(this._cache.deudas.map(d => d.empresa === oldName ? { ...d, empresa: newName } : d));
  },
  deleteEmpresa(nombre) {
    this.saveEmpresas(this.getEmpresas().filter(e => e !== nombre));
  },

  // ---------- Pagos ----------
  getPagos() { return [...this._cache.pagos]; },
  savePagos(list) {
    const antes = new Set(this._cache.pagos.map(p => p.id));
    const ahora = new Set(list.map(p => p.id));
    this._cache.pagos = list;
    const aBorrar = [...antes].filter(id => !ahora.has(id));
    if (aBorrar.length) sincronizar(supabaseClient.from('pagos').delete().in('id', aBorrar), 'savePagos:delete');
    if (list.length) sincronizar(supabaseClient.from('pagos').upsert(list.map(pagoToRow), { onConflict: 'deuda_id,mes' }), 'savePagos:upsert');
  },
  getPago(deudaId, mes) {
    return this._cache.pagos.find(p => p.deudaId === deudaId && p.mes === mes) || null;
  },
  getPagosDeMes(mes) { return this._cache.pagos.filter(p => p.mes === mes); },
  getPagosDeDeuda(deudaId) {
    return this._cache.pagos.filter(p => p.deudaId === deudaId).sort((a, b) => Utils.compareMonth(a.mes, b.mes));
  },
  upsertPago(pago) {
    const idx = this._cache.pagos.findIndex(p => p.deudaId === pago.deudaId && p.mes === pago.mes);
    let final;
    if (idx === -1) {
      final = { ...pago, id: pago.id || Utils.uid() };
      this._cache.pagos.push(final);
    } else {
      final = { ...this._cache.pagos[idx], ...pago };
      this._cache.pagos[idx] = final;
    }
    sincronizar(supabaseClient.from('pagos').upsert(pagoToRow(final), { onConflict: 'deuda_id,mes' }), 'upsertPago');
    return this.getPago(final.deudaId, final.mes);
  },

  // Cuotas pagadas de un crédito: las de antes de usar la app (base) + los meses marcados
  // como pagados. Se calcula siempre desde el historial (no se arrastra de un mes al
  // siguiente), así nunca queda desfasado aunque se pague en otro orden o se deshaga un pago.
  _contarCuotas(deuda, mes, incluirMes) {
    const pagados = this._cache.pagos.filter(p => {
      if (p.deudaId !== deuda.id || !p.pagado) return false;
      const cmp = Utils.compareMonth(p.mes, mes);
      return incluirMes ? cmp <= 0 : cmp < 0;
    }).length;
    return Math.max(0, Math.min((deuda.cuotasPagadasBase || 0) + pagados, deuda.cuotasTotales ?? Infinity));
  },
  // Hasta (e incluyendo) el mes indicado.
  cuotasPagadasHasta(deudaId, mes) {
    const deuda = this.getDeuda(deudaId);
    return deuda ? this._contarCuotas(deuda, mes, true) : 0;
  },
  // Estrictamente antes del mes indicado.
  cuotaAcumuladaAntesDe(deudaId, mes) {
    const deuda = this.getDeuda(deudaId);
    return deuda ? this._contarCuotas(deuda, mes, false) : 0;
  },

  // Toda deuda archivada se considera pagada: marca como pagado cualquier mes que haya
  // quedado pendiente (p. ej. cuotas que ya estaban pagadas antes de usar la app).
  liquidarArchivadas(deudaId) {
    const cambios = [];
    this._cache.pagos.forEach((p, i) => {
      if (p.pagado || (deudaId && p.deudaId !== deudaId)) return;
      const deuda = this.getDeuda(p.deudaId);
      if (!deuda || deuda.activa) return;
      this._cache.pagos[i] = { ...p, pagado: true, fechaPago: deuda.fechaArchivo || new Date().toISOString() };
      cambios.push(this._cache.pagos[i]);
    });
    if (cambios.length) {
      sincronizar(supabaseClient.from('pagos').upsert(cambios.map(pagoToRow), { onConflict: 'deuda_id,mes' }), 'liquidarArchivadas');
    }
    return cambios.length;
  },

  // Un crédito cuyas cuotas ya estaban todas pagadas antes de un mes no debe nada ese mes:
  // deja ese pago en $0 (igual que ensureMes al crear meses nuevos).
  cerrarCreditosCompletos() {
    const cambios = [];
    this._cache.pagos.forEach((p, i) => {
      if (p.pagado || Number(p.gasto) === 0) return;
      const deuda = this.getDeuda(p.deudaId);
      if (!deuda || !deuda.activa || deuda.tipo !== 'cuotas' || deuda.cuotasTotales == null) return;
      if (this._contarCuotas(deuda, p.mes, false) < deuda.cuotasTotales) return;
      this._cache.pagos[i] = { ...p, gasto: 0 };
      cambios.push(this._cache.pagos[i]);
    });
    if (cambios.length) {
      sincronizar(supabaseClient.from('pagos').upsert(cambios.map(pagoToRow), { onConflict: 'deuda_id,mes' }), 'cerrarCreditosCompletos');
    }
    return cambios.length;
  },

  // Un crédito con todas sus cuotas pagadas (3/3) se archiva solo, así no aparece en los
  // meses siguientes. Queda visible solo en el mes en que se completó. Devuelve cuántos archivó.
  archivarCompletas() {
    let n = 0;
    this._cache.deudas.filter(d => d.activa && d.tipo === 'cuotas' && d.cuotasTotales != null).forEach(d => {
      if (this._contarCuotas(d, '9999-12', true) < d.cuotasTotales) return;
      // Mes en que se completó: el del último pago marcado; si nunca hubo (ya venía
      // pagado al registrarlo), el mes en que se registró.
      const pagados = this.getPagosDeDeuda(d.id).filter(p => p.pagado);
      const ultimo = pagados[pagados.length - 1];
      let fecha;
      if (ultimo) fecha = (ultimo.fechaPago && ultimo.fechaPago.slice(0, 7) === ultimo.mes) ? ultimo.fechaPago : `${ultimo.mes}-15T12:00:00.000Z`;
      else fecha = `${d.fechaInicio}-15T12:00:00.000Z`;
      this.updateDeuda(d.id, { activa: false, fechaArchivo: fecha });
      this.liquidarArchivadas(d.id);
      this.recalcularAcumulados(d.id);
      n++;
    });
    return n;
  },

  // Corrige de una vez los registros de pagos inconsistentes. Devuelve cuántos tocó.
  sanearPagos() {
    return this.archivarCompletas() + this.liquidarArchivadas() + this.cerrarCreditosCompletos() + this.recalcularAcumulados();
  },

  // Deja el campo guardado "cuotaPagadaAcumulada" de cada pago de un crédito (o de todos
  // si no se indica deudaId) igual al valor calculado. Devuelve cuántos pagos corrigió.
  recalcularAcumulados(deudaId) {
    const cambios = [];
    this._cache.pagos.forEach((p, i) => {
      if (deudaId && p.deudaId !== deudaId) return;
      const deuda = this.getDeuda(p.deudaId);
      if (!deuda || deuda.tipo !== 'cuotas') return;
      const esperado = this._contarCuotas(deuda, p.mes, !!p.pagado);
      if (p.cuotaPagadaAcumulada !== esperado) {
        this._cache.pagos[i] = { ...p, cuotaPagadaAcumulada: esperado };
        cambios.push(this._cache.pagos[i]);
      }
    });
    if (cambios.length) {
      sincronizar(supabaseClient.from('pagos').upsert(cambios.map(pagoToRow), { onConflict: 'deuda_id,mes' }), 'recalcularAcumulados');
    }
    return cambios.length;
  },

  // Genera (si no existen) los registros de pago del mes para todas las deudas activas,
  // arrastrando el gasto esperado y el acumulado de cuotas del mes anterior. Idempotente.
  ensureMes(mes) {
    const deudas = this._cache.deudas.filter(d => d.activa);
    const pagos = this.getPagos();
    let changed = false;
    deudas.forEach(d => {
      const existe = pagos.find(p => p.deudaId === d.id && p.mes === mes);
      if (existe) return;
      const acumAntes = this.cuotaAcumuladaAntesDe(d.id, mes);
      const completa = d.tipo === 'cuotas' && d.cuotasTotales != null && acumAntes >= d.cuotasTotales;
      pagos.push({
        id: Utils.uid(),
        deudaId: d.id,
        mes,
        gasto: completa ? 0 : d.valorCuota,
        cuotaPagadaAcumulada: d.tipo === 'cuotas' ? acumAntes : null,
        pagado: false,
        fechaPago: null,
      });
      changed = true;
    });
    if (changed) this.savePagos(pagos);
  },

  marcarPago(deudaId, mes, pagado) {
    const deuda = this.getDeuda(deudaId);
    const pago = this.getPago(deudaId, mes) || { deudaId, mes, gasto: deuda.valorCuota, cuotaPagadaAcumulada: null, pagado: false };
    this.upsertPago({
      ...pago,
      pagado,
      fechaPago: pagado ? new Date().toISOString() : null,
      cuotaPagadaAcumulada: deuda.tipo === 'cuotas' ? pago.cuotaPagadaAcumulada : null,
    });
    // Recalcula este pago y los meses siguientes del mismo crédito (su acumulado cambia).
    if (deuda.tipo === 'cuotas') {
      this.recalcularAcumulados(deudaId);
      if (pagado) this.archivarCompletas(); // si era la última cuota, el crédito se archiva solo
    }
  },

  // ---------- Ingresos ----------
  getIngresos() { return [...this._cache.ingresos]; },
  saveIngresos(list) {
    const antes = new Set(this._cache.ingresos.map(i => i.id));
    const ahora = new Set(list.map(i => i.id));
    this._cache.ingresos = list;
    const aBorrar = [...antes].filter(id => !ahora.has(id));
    if (aBorrar.length) sincronizar(supabaseClient.from('ingresos').delete().in('id', aBorrar), 'saveIngresos:delete');
    if (list.length) sincronizar(supabaseClient.from('ingresos').upsert(list.map(ingresoToRow)), 'saveIngresos:upsert');
  },
  getIngresosDeMes(mes) { return this._cache.ingresos.filter(i => i.mes === mes); },
  addIngreso(ingreso) {
    const nuevo = { id: Utils.uid(), fuente: '', monto: 0, mes: Utils.monthKey(), tipo: 'fijo', notas: '', ...ingreso };
    this._cache.ingresos.push(nuevo);
    sincronizar(supabaseClient.from('ingresos').insert(ingresoToRow(nuevo)), 'addIngreso');
    return nuevo;
  },
  updateIngreso(id, patch) {
    const idx = this._cache.ingresos.findIndex(i => i.id === id);
    if (idx === -1) return null;
    this._cache.ingresos[idx] = { ...this._cache.ingresos[idx], ...patch };
    sincronizar(supabaseClient.from('ingresos').update(ingresoToRow(this._cache.ingresos[idx])).eq('id', id), 'updateIngreso');
    return this._cache.ingresos[idx];
  },
  deleteIngreso(id) {
    this._cache.ingresos = this._cache.ingresos.filter(i => i.id !== id);
    sincronizar(supabaseClient.from('ingresos').delete().eq('id', id), 'deleteIngreso');
  },

  // ---------- Gastos (consumo propio / por rendir a la empresa) ----------
  getGastos() { return [...this._cache.gastos]; },
  saveGastos(list) {
    const antes = new Set(this._cache.gastos.map(g => g.id));
    const ahora = new Set(list.map(g => g.id));
    this._cache.gastos = list;
    const aBorrar = [...antes].filter(id => !ahora.has(id));
    if (aBorrar.length) sincronizar(supabaseClient.from('gastos').delete().in('id', aBorrar), 'saveGastos:delete');
    if (list.length) sincronizar(supabaseClient.from('gastos').upsert(list.map(gastoToRow)), 'saveGastos:upsert');
  },
  getGasto(id) { return this._cache.gastos.find(g => g.id === id) || null; },
  getGastosDeMes(mes, tipo) {
    return this._cache.gastos.filter(g => g.fecha.slice(0, 7) === mes && (!tipo || g.tipo === tipo));
  },
  addGasto(gasto) {
    const nuevo = {
      id: Utils.uid(),
      tipo: 'consumo', // 'consumo' | 'rendir'
      detalle: '',
      monto: 0,
      fecha: new Date().toISOString().slice(0, 10),
      categoria: 'Otros',
      notas: '',
      fotoBoletaId: null,
      estado: 'pendiente',
      fechaRendido: null,
      fechaReembolso: null,
      fotoComprobanteId: null,
      creadoEn: new Date().toISOString(),
      ...gasto,
    };
    this._cache.gastos.push(nuevo);
    sincronizar(supabaseClient.from('gastos').insert(gastoToRow(nuevo)), 'addGasto');
    return nuevo;
  },
  updateGasto(id, patch) {
    const idx = this._cache.gastos.findIndex(g => g.id === id);
    if (idx === -1) return null;
    this._cache.gastos[idx] = { ...this._cache.gastos[idx], ...patch };
    sincronizar(supabaseClient.from('gastos').update(gastoToRow(this._cache.gastos[idx])).eq('id', id), 'updateGasto');
    return this._cache.gastos[idx];
  },
  deleteGasto(id) {
    const gasto = this.getGasto(id);
    this._cache.gastos = this._cache.gastos.filter(g => g.id !== id);
    sincronizar(supabaseClient.from('gastos').delete().eq('id', id), 'deleteGasto');
    if (gasto) {
      if (gasto.fotoBoletaId) Photos.delete(gasto.fotoBoletaId);
      if (gasto.fotoComprobanteId) Photos.delete(gasto.fotoComprobanteId);
    }
  },

  // ---------- Meta (local al dispositivo: tema, mes actual, preferencias) ----------
  getMeta() { return this._read(STORAGE_KEYS.meta, {}); },
  setMeta(patch) { this._write(STORAGE_KEYS.meta, { ...this.getMeta(), ...patch }); },
  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Error leyendo', key, e);
      return fallback;
    }
  },
  _write(key, value) { localStorage.setItem(key, JSON.stringify(value)); },

  // ---------- Cierre de mes (arrastre de saldo al mes siguiente) ----------
  getCierres() { return [...this._cache.cierres]; },
  saveCierres(list) {
    const antes = new Set(this._cache.cierres.map(c => c.mes));
    const ahora = new Set(list.map(c => c.mes));
    this._cache.cierres = list;
    const aBorrar = [...antes].filter(mes => !ahora.has(mes));
    if (aBorrar.length) sincronizar(supabaseClient.from('cierres').delete().in('mes', aBorrar), 'saveCierres:delete');
    if (list.length) sincronizar(supabaseClient.from('cierres').upsert(list.map(cierreToRow)), 'saveCierres:upsert');
  },
  getCierre(mes) { return this._cache.cierres.find(c => c.mes === mes) || null; },

  // Saldo con el que parte un mes: lo que sobró del mes anterior (nunca negativo;
  // si no sobró nada, o el mes anterior no está cerrado, parte en $0).
  getSaldoInicial(mes) {
    const cierre = this.getCierre(Utils.shiftMonth(mes, -1));
    return cierre ? Math.max(0, cierre.saldoFinal) : 0;
  },

  // Balance real de un mes: saldo inicial + ingresos del mes - gastos del mes
  // (mismo criterio que la tarjeta "Balance disponible" del Resumen).
  calcularBalanceMes(mes) {
    const ingresosTotal = this.getIngresosDeMes(mes).reduce((s, i) => s + Number(i.monto), 0);
    const gastosTotal = this.getPagosDeMes(mes).reduce((s, p) => s + Number(p.gasto), 0);
    return this.getSaldoInicial(mes) + ingresosTotal - gastosTotal;
  },

  cerrarMes(mes) {
    const saldoFinal = this.calcularBalanceMes(mes);
    const list = this.getCierres().filter(c => c.mes !== mes);
    list.push({ mes, saldoFinal, fechaCierre: new Date().toISOString(), ajustado: false });
    this.saveCierres(list);
    return saldoFinal;
  },
  reabrirMes(mes) {
    this.saveCierres(this.getCierres().filter(c => c.mes !== mes));
  },
  // Permite corregir a mano el saldo trasladado, por si quedó algo sin registrar en el mes.
  ajustarCierre(mes, nuevoSaldo) {
    const cierre = this.getCierre(mes);
    if (!cierre) return null;
    const actualizado = { ...cierre, saldoFinal: Math.max(0, Number(nuevoSaldo) || 0), ajustado: true, fechaAjuste: new Date().toISOString() };
    this.saveCierres([...this.getCierres().filter(c => c.mes !== mes), actualizado]);
    return actualizado;
  },

  exportAll() {
    return JSON.stringify({
      version: 5,
      exportadoEn: new Date().toISOString(),
      deudas: this.getDeudas(),
      pagos: this.getPagos(),
      ingresos: this.getIngresos(),
      gastos: this.getGastos(),
      meta: this.getMeta(),
      empresas: this.getEmpresas(),
      cierres: this.getCierres(),
      pin: (typeof Lock !== 'undefined') ? Lock.getConfig() : null,
      biometric: (typeof Biometric !== 'undefined') ? Biometric.getConfig() : null,
    }, null, 2);
  },
  importAll(json) {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.deudas)) throw new Error('Archivo inválido');
    this.saveDeudas(data.deudas || []);
    this.savePagos(data.pagos || []);
    this.saveIngresos(data.ingresos || []);
    this.saveGastos(data.gastos || []);
    if (data.meta) this.setMeta(data.meta);
    if (data.empresas) this.saveEmpresas(data.empresas);
    if (data.cierres) this.saveCierres(data.cierres);
    if (data.pin && typeof Lock !== 'undefined') Lock.setConfig(data.pin);
    if (data.biometric && typeof Biometric !== 'undefined') Biometric.setConfig(data.biometric);
  },

  // Borra TODO: tanto la nube (Supabase, afecta a cualquiera con sesión) como las
  // preferencias/seguridad locales de este dispositivo. Es async porque espera a
  // que las tablas se vacíen de verdad antes de continuar.
  async resetAll() {
    const borrarTabla = (tabla, columna, valorImposible) =>
      supabaseClient.from(tabla).delete().neq(columna, valorImposible);
    const resultados = await Promise.all([
      borrarTabla('pagos', 'id', '00000000-0000-0000-0000-000000000000'),
      borrarTabla('gastos', 'id', '00000000-0000-0000-0000-000000000000'),
      borrarTabla('deudas', 'id', '00000000-0000-0000-0000-000000000000'),
      borrarTabla('ingresos', 'id', '00000000-0000-0000-0000-000000000000'),
      borrarTabla('empresas', 'nombre', '__ninguna__'),
      borrarTabla('cierres', 'mes', '__ninguno__'),
    ]);
    for (const r of resultados) if (r.error) throw r.error;
    this._cache = { deudas: [], pagos: [], ingresos: [], gastos: [], empresas: [], cierres: [] };
    localStorage.removeItem(STORAGE_KEYS.meta);
    if (typeof Lock !== 'undefined') { Lock.disable(); localStorage.removeItem(Lock.KEY); }
    if (typeof Biometric !== 'undefined') { Biometric.disable(); localStorage.removeItem(Biometric.KEY); }
  },

  // Marca de primera vez en este dispositivo (ya no crea datos de ejemplo: la nube
  // parte vacía o con lo que ya hayan cargado otros dispositivos).
  seedIfEmpty() {
    if (this.getMeta().seeded) return;
    this.setMeta({ seeded: true, mesActual: Utils.monthKey() });
  },

  // Migraciones puntuales sobre datos ya existentes (idempotente).
  migrar() {
    const meta = this.getMeta();
    if (!meta.migracion_totol_v1) {
      this.renameEmpresa('Totot', 'Totol');
      this.setMeta({ migracion_totol_v1: true });
    }
    // Las cuotas que ya llevaban pagadas los créditos cargados al inicio (antes de julio)
    // quedaron guardadas solo dentro del "acumulado" del primer pago, y la base de cada
    // crédito en 0. Al calcular las cuotas desde el historial esas cuotas se perdían
    // (p. ej. Ford 16/23 pasaba a 2/23). Se restituye la base (= acumulado de julio − 1).
    if (!meta.migracion_base_cuotas_v1) {
      const BASES = {
        'Crédito Ford Aportillao': 14, 'Nintendo Switch2 BCI': 9, 'Plumón Rosen': 2,
        'Refrigerador Mamá': 1, 'Botas Mili BCI': -1, 'Crédito Auto': 3,
        'Camita Milita': 4, 'Muno Mili': 1, 'Ropita Mili Ripley': 1, 'Carrito Vacaciones': 1,
      };
      this._cache.deudas.forEach(d => {
        const base = BASES[d.detalle];
        if (d.tipo === 'cuotas' && base !== undefined && (d.cuotasPagadasBase || 0) === 0) {
          this.updateDeuda(d.id, { cuotasPagadasBase: base });
        }
      });
      this.setMeta({ migracion_base_cuotas_v1: true });
    }
  },
};
