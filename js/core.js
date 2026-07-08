// core.js — utilidades, capa de datos (localStorage) y datos semilla de la planilla.
// Todo el estado vive en localStorage. No hay llamadas de red en ningún punto de este archivo.

const STORAGE_KEYS = {
  deudas: 'ff_deudas_v1',
  pagos: 'ff_pagos_v1',
  ingresos: 'ff_ingresos_v1',
  gastos: 'ff_gastos_v1',
  meta: 'ff_meta_v1',
};

const CATEGORIAS = [
  'Servicios Básicos',
  'Suscripciones',
  'Ahorro',
  'Compras en Cuotas',
  'Créditos',
  'Tarjetas de Crédito',
  'Otros',
];

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

const DB = {
  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Error leyendo', key, e);
      return fallback;
    }
  },
  _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  getDeudas() { return this._read(STORAGE_KEYS.deudas, []); },
  saveDeudas(list) { this._write(STORAGE_KEYS.deudas, list); },
  getDeuda(id) { return this.getDeudas().find(d => d.id === id) || null; },
  addDeuda(deuda) {
    const list = this.getDeudas();
    const nueva = {
      id: Utils.uid(),
      empresa: '',
      detalle: '',
      categoria: 'Otros',
      icono: '📌',
      tipo: 'recurrente',
      cuotasTotales: null,
      valorCuota: 0,
      cuotasPagadasBase: 0,
      fechaInicio: Utils.monthKey(),
      activa: true,
      fechaArchivo: null,
      notas: '',
      creadoEn: new Date().toISOString(),
      ...deuda,
    };
    list.push(nueva);
    this.saveDeudas(list);
    return nueva;
  },
  updateDeuda(id, patch) {
    const list = this.getDeudas();
    const idx = list.findIndex(d => d.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this.saveDeudas(list);
    return list[idx];
  },
  deleteDeuda(id) {
    this.saveDeudas(this.getDeudas().filter(d => d.id !== id));
    this.savePagos(this.getPagos().filter(p => p.deudaId !== id));
  },
  getDeudasArchivadas() {
    return this.getDeudas().filter(d => !d.activa).sort((a, b) => (b.fechaArchivo || '').localeCompare(a.fechaArchivo || ''));
  },
  archivarDeuda(id) {
    return this.updateDeuda(id, { activa: false, fechaArchivo: new Date().toISOString() });
  },
  reactivarDeuda(id) {
    return this.updateDeuda(id, { activa: true, fechaArchivo: null });
  },

  getPagos() { return this._read(STORAGE_KEYS.pagos, []); },
  savePagos(list) { this._write(STORAGE_KEYS.pagos, list); },
  getPago(deudaId, mes) {
    return this.getPagos().find(p => p.deudaId === deudaId && p.mes === mes) || null;
  },
  getPagosDeMes(mes) { return this.getPagos().filter(p => p.mes === mes); },
  getPagosDeDeuda(deudaId) {
    return this.getPagos().filter(p => p.deudaId === deudaId).sort((a, b) => Utils.compareMonth(a.mes, b.mes));
  },
  upsertPago(pago) {
    const list = this.getPagos();
    const idx = list.findIndex(p => p.deudaId === pago.deudaId && p.mes === pago.mes);
    if (idx === -1) {
      pago.id = Utils.uid();
      list.push(pago);
    } else {
      list[idx] = { ...list[idx], ...pago };
    }
    this.savePagos(list);
    return this.getPago(pago.deudaId, pago.mes);
  },

  // Cuota acumulada de una deuda hasta (e incluyendo) el mes indicado, considerando
  // la última cuota registrada estrictamente antes de ese mes.
  cuotaAcumuladaAntesDe(deudaId, mes) {
    const deuda = this.getDeuda(deudaId);
    if (!deuda) return 0;
    const historial = this.getPagosDeDeuda(deudaId).filter(p => Utils.compareMonth(p.mes, mes) < 0);
    if (historial.length === 0) return deuda.cuotasPagadasBase || 0;
    return historial[historial.length - 1].cuotaPagadaAcumulada ?? (deuda.cuotasPagadasBase || 0);
  },

  // Genera (si no existen) los registros de pago del mes para todas las deudas activas,
  // arrastrando el gasto esperado y el acumulado de cuotas del mes anterior. Idempotente.
  ensureMes(mes) {
    const deudas = this.getDeudas().filter(d => d.activa);
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
    const acumAntes = this.cuotaAcumuladaAntesDe(deudaId, mes);
    let nuevoAcum = pago.cuotaPagadaAcumulada ?? acumAntes;
    if (deuda.tipo === 'cuotas') {
      nuevoAcum = pagado ? Math.min(acumAntes + 1, deuda.cuotasTotales ?? Infinity) : acumAntes;
    }
    this.upsertPago({
      ...pago,
      pagado,
      fechaPago: pagado ? new Date().toISOString() : null,
      cuotaPagadaAcumulada: nuevoAcum,
    });
  },

  getIngresos() { return this._read(STORAGE_KEYS.ingresos, []); },
  saveIngresos(list) { this._write(STORAGE_KEYS.ingresos, list); },
  getIngresosDeMes(mes) { return this.getIngresos().filter(i => i.mes === mes); },
  addIngreso(ingreso) {
    const list = this.getIngresos();
    const nuevo = { id: Utils.uid(), fuente: '', monto: 0, mes: Utils.monthKey(), tipo: 'fijo', notas: '', ...ingreso };
    list.push(nuevo);
    this.saveIngresos(list);
    return nuevo;
  },
  updateIngreso(id, patch) {
    const list = this.getIngresos();
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this.saveIngresos(list);
    return list[idx];
  },
  deleteIngreso(id) {
    this.saveIngresos(this.getIngresos().filter(i => i.id !== id));
  },

  // ---------- Gastos (consumo propio / por rendir a la empresa) ----------
  getGastos() { return this._read(STORAGE_KEYS.gastos, []); },
  saveGastos(list) { this._write(STORAGE_KEYS.gastos, list); },
  getGasto(id) { return this.getGastos().find(g => g.id === id) || null; },
  getGastosDeMes(mes, tipo) {
    return this.getGastos().filter(g => g.fecha.slice(0, 7) === mes && (!tipo || g.tipo === tipo));
  },
  addGasto(gasto) {
    const list = this.getGastos();
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
    list.push(nuevo);
    this.saveGastos(list);
    return nuevo;
  },
  updateGasto(id, patch) {
    const list = this.getGastos();
    const idx = list.findIndex(g => g.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this.saveGastos(list);
    return list[idx];
  },
  deleteGasto(id) {
    const gasto = this.getGasto(id);
    this.saveGastos(this.getGastos().filter(g => g.id !== id));
    if (gasto) {
      if (gasto.fotoBoletaId) Photos.delete(gasto.fotoBoletaId);
      if (gasto.fotoComprobanteId) Photos.delete(gasto.fotoComprobanteId);
    }
  },

  getMeta() { return this._read(STORAGE_KEYS.meta, {}); },
  setMeta(patch) { this._write(STORAGE_KEYS.meta, { ...this.getMeta(), ...patch }); },

  exportAll() {
    return JSON.stringify({
      version: 2,
      exportadoEn: new Date().toISOString(),
      deudas: this.getDeudas(),
      pagos: this.getPagos(),
      ingresos: this.getIngresos(),
      gastos: this.getGastos(),
      meta: this.getMeta(),
      pin: (typeof Lock !== 'undefined') ? Lock.getConfig() : null,
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
    if (data.pin && typeof Lock !== 'undefined') Lock.setConfig(data.pin);
  },
  resetAll() {
    localStorage.removeItem(STORAGE_KEYS.deudas);
    localStorage.removeItem(STORAGE_KEYS.pagos);
    localStorage.removeItem(STORAGE_KEYS.ingresos);
    localStorage.removeItem(STORAGE_KEYS.gastos);
    localStorage.removeItem(STORAGE_KEYS.meta);
    if (typeof Lock !== 'undefined') { Lock.disable(); localStorage.removeItem(Lock.KEY); }
    if (window.indexedDB) indexedDB.deleteDatabase('ff_photos_db');
  },

  seedIfEmpty() {
    if (this.getMeta().seeded) return;
    const D = (empresa, detalle, categoria, tipo, cuotasTotales, valorCuota, cuotasPagadasBaseJulio, icono) => ({
      empresa, detalle, categoria, tipo, cuotasTotales, valorCuota, cuotasPagadasBaseJulio, icono,
    });
    // Datos tomados de la planilla original (Julio/Agosto 2026).
    const seed = [
      D('Essbio', 'Agua', 'Servicios Básicos', 'recurrente', null, 29490, null, '💧'),
      D('CGE', 'Electricidad', 'Servicios Básicos', 'recurrente', null, 59800, null, '⚡'),
      D('Movistar', 'Internet Casa', 'Servicios Básicos', 'recurrente', null, 24064, null, '📶'),
      D('Movistar', 'Cuenta Celular Mami', 'Servicios Básicos', 'recurrente', null, 21676, null, '📱'),
      D('Totot', 'Netflix varios CMR', 'Suscripciones', 'recurrente', null, 9000, null, '🎬'),
      D('Totot', 'Diferencia Netflix mama', 'Suscripciones', 'recurrente', null, 2890, null, '🎬'),
      D('Totot', 'Suscripción YouTube CMR', 'Suscripciones', 'recurrente', null, 6150, null, '📺'),
      D('Totot', 'Ahorro Amorsito Pequeñito', 'Ahorro', 'recurrente', null, 10000, null, '🐷'),
      D('Totot', 'Crédito Ford Aportillao', 'Compras en Cuotas', 'cuotas', 23, 25000, 15, '🚗'),
      D('Totot', 'Diferencia Meli-Disney+', 'Suscripciones', 'recurrente', null, -4000, null, '✨'),
      D('Totot', 'Nintendo Switch2 BCI', 'Compras en Cuotas', 'cuotas', 24, 28749, 10, '🎮'),
      D('Totot', 'Camita Milita', 'Compras en Cuotas', 'cuotas', 6, 42094, 5, '🛏️'),
      D('Totot', 'Rocky', 'Otros', 'recurrente', null, 10000, null, '🐶'),
      D('Totot', 'Agua Manantial', 'Compras en Cuotas', 'cuotas', 12, 6500, 3, '🚰'),
      D('Totot', 'Plumón Rosen', 'Compras en Cuotas', 'cuotas', 12, 2229, 3, '🖊️'),
      D('Totot', 'Muno Mili', 'Compras en Cuotas', 'cuotas', 3, 7774, 2, '🧸'),
      D('Totot', 'Carrito Vacaciones', 'Compras en Cuotas', 'cuotas', 3, 6334, 2, '🧳'),
      D('Totot', 'Silla auto Milita', 'Compras en Cuotas', 'cuotas', 12, 5683, 1, '🚼'),
      D('Totot', 'Refrigerador Mamá', 'Compras en Cuotas', 'cuotas', 10, 22300, 2, '🧊'),
      D('Totot', 'Botas Mili BCI', 'Compras en Cuotas', 'cuotas', 3, 9215, 0, '👢'),
      D('Totot', 'Ropita Mili Ripley', 'Compras en Cuotas', 'cuotas', 3, 7241, 2, '👕'),
      D('Banco Estado', 'Varios Gastos Crédito', 'Créditos', 'recurrente', null, 110263, null, '🏦'),
      D('Scotiabank', 'CAE', 'Créditos', 'cuotas', null, 27690, 35, '🎓'),
      D('Papito', 'Crédito Auto', 'Créditos', 'cuotas', 36, 227012, 4, '🚙'),
      D('Falabella', 'Cuenta Falabella', 'Tarjetas de Crédito', 'recurrente', null, 15000, null, '💳'),
      D('Coopeuch', 'Préstamos + Acciones', 'Créditos', 'recurrente', null, 108500, null, '🏦'),
      D('TAG', 'Ida a Santiago', 'Servicios Básicos', 'cuotas', 1, 301, 0, '🛣️'),
      D('Spin', 'Créditos Varios', 'Créditos', 'recurrente', null, 15000, null, '💰'),
      D('Crédito MercadoLibre', 'Créditos MercadoLibre', 'Créditos', 'cuotas', 2, 32445, 0, '📦'),
      D('MercadoLibre', 'Cuenta Meli+Diney', 'Tarjetas de Crédito', 'recurrente', null, 8000, null, '💳'),
    ];

    const deudas = [];
    const pagos = [];
    const MES_JULIO = '2026-07';
    const MES_AGOSTO = '2026-08';

    seed.forEach(s => {
      const deuda = {
        id: Utils.uid(),
        empresa: s.empresa,
        detalle: s.detalle,
        categoria: s.categoria,
        icono: s.icono || '📌',
        tipo: s.tipo,
        cuotasTotales: s.cuotasTotales,
        valorCuota: s.valorCuota,
        cuotasPagadasBase: 0,
        fechaInicio: MES_JULIO,
        activa: true,
        fechaArchivo: null,
        notas: '',
        creadoEn: new Date().toISOString(),
      };
      deudas.push(deuda);

      if (s.tipo === 'cuotas') {
        pagos.push({ id: Utils.uid(), deudaId: deuda.id, mes: MES_JULIO, gasto: s.valorCuota, cuotaPagadaAcumulada: s.cuotasPagadasBaseJulio, pagado: true, fechaPago: `${MES_JULIO}-05T00:00:00.000Z` });
        const acumAgosto = deuda.cuotasTotales != null ? Math.min(s.cuotasPagadasBaseJulio + 1, deuda.cuotasTotales) : s.cuotasPagadasBaseJulio + 1;
        pagos.push({ id: Utils.uid(), deudaId: deuda.id, mes: MES_AGOSTO, gasto: s.valorCuota, cuotaPagadaAcumulada: acumAgosto, pagado: false, fechaPago: null });
      } else {
        pagos.push({ id: Utils.uid(), deudaId: deuda.id, mes: MES_JULIO, gasto: s.valorCuota, cuotaPagadaAcumulada: null, pagado: true, fechaPago: `${MES_JULIO}-05T00:00:00.000Z` });
        pagos.push({ id: Utils.uid(), deudaId: deuda.id, mes: MES_AGOSTO, gasto: s.valorCuota, cuotaPagadaAcumulada: null, pagado: false, fechaPago: null });
      }
    });

    this.saveDeudas(deudas);
    this.savePagos(pagos);
    this.saveIngresos([
      { id: Utils.uid(), fuente: 'Sueldo Papá', monto: 900000, mes: MES_JULIO, tipo: 'fijo', notas: '' },
      { id: Utils.uid(), fuente: 'Sueldo Mamá', monto: 550000, mes: MES_JULIO, tipo: 'fijo', notas: '' },
      { id: Utils.uid(), fuente: 'Sueldo Papá', monto: 900000, mes: MES_AGOSTO, tipo: 'fijo', notas: '' },
      { id: Utils.uid(), fuente: 'Sueldo Mamá', monto: 550000, mes: MES_AGOSTO, tipo: 'fijo', notas: '' },
    ]);
    this.setMeta({ seeded: true, mesActual: MES_JULIO });
  },
};
