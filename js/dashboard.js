/* ============================================================
   FM_FINANCE — dashboard.js
   Carga datos, calcula KPIs, renderiza gráficos, tabla y metas.
   ============================================================ */

(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);

  // --- Estado ---
  let mesActual = mesActualYYYYMM();
  let txMes = [];          // transacciones del mes seleccionado
  let pagina = 1;
  let metas = Metas.get();   // metas de ahorro (localStorage, editables)
  let ultimoResumen = null;  // último resumen cargado (para re-render de metas)
  let saldoTotalActual = null;   // saldo acumulado de TODO el historial (Sheets.balance)
  let recurrentesSet = new Set(); // claves "categoria|monto" detectadas como gasto recurrente

  // --- Refs ---
  const mesLabel = $('#mesLabel');
  const loading  = $('#loading');

  // ------------------------------------------------------------
  // Carga principal
  // ------------------------------------------------------------
  async function cargar() {
    if (!Conexion.configurada()) { abrirConfig(); return; }
    loading.hidden = false;
    try {
      // UNA sola llamada al backend (antes eran 5 en paralelo: Apps Script a
      // veces rechaza tantas invocaciones simultáneas y devuelve HTML de error
      // en vez de JSON). El backend hace una única lectura de la hoja y arma
      // todo: transacciones del mes, resumen, metas, saldo y ventana de recurrentes.
      const ventanaRecurrentes = mesesAnteriores(mesActual, 3).join(',');
      const d = await Sheets.dashboard(mesActual, ventanaRecurrentes);
      const txs = d.tx, resumen = d.resumen, serverMetas = d.metas;
      txMes = txs;
      pagina = 1;
      saldoTotalActual = typeof d.saldo === 'number' ? d.saldo : null;
      recurrentesSet = calcularRecurrentes(d.txsRecientes);
      await sincronizarMetas(serverMetas);
      renderSaldoTotal(saldoTotalActual);
      renderKPIs(txs, resumen);
      renderAlertas(txs);
      Charts.renderDonut($('#chartDonut'), gastosPorCategoria(txs));
      Charts.renderBar($('#chartBar'), resumen, saldoTotalActual);
      renderTabla();
      renderMetas(resumen);
    } catch (err) {
      mostrarToast('✗ Error al cargar: ' + err.message, 'error', 4000);
    } finally {
      loading.hidden = true;
    }
  }

  // ------------------------------------------------------------
  // Fase 1 — Saldo total (persistente, independiente del mes)
  // ------------------------------------------------------------
  function renderSaldoTotal(saldo) {
    const el = $('#saldoTotalVal');
    if (!el) return;
    if (typeof saldo !== 'number') { el.textContent = '—'; return; }
    animarMoneda(el, saldo);
  }

  // ------------------------------------------------------------
  // Fase 4 — Detección heurística de gastos recurrentes (sin IA)
  // Si una misma categoría+monto aparece en 2 de los últimos 3 meses,
  // se considera "recurrente" (suscripción, gym, internet...).
  // ------------------------------------------------------------
  function calcularRecurrentes(txs) {
    const porClave = {};
    (txs || []).forEach((t) => {
      if (t.tipo !== 'gasto') return;
      const clave = `${t.categoria}|${Math.round(t.monto)}`;
      (porClave[clave] || (porClave[clave] = new Set())).add(t.mes);
    });
    const set = new Set();
    Object.entries(porClave).forEach(([clave, meses]) => { if (meses.size >= 2) set.add(clave); });
    return set;
  }

  const PEND_METAS = 'fm_metas_pendiente';

  // Reconcilia metas locales <-> backend (backend = fuente de verdad).
  async function sincronizarMetas(serverMetas) {
    if (localStorage.getItem(PEND_METAS)) {
      // hay cambios locales sin subir → empujarlos primero
      try { await Sheets.guardarMetas(metas); localStorage.removeItem(PEND_METAS); } catch (e) { /* sigue offline */ }
      return;
    }
    if (serverMetas === undefined) return;              // sin red → conserva las locales
    if (serverMetas === null) {                         // backend nunca tuvo metas → sembrar con las locales
      if (metas.length) { try { await Sheets.guardarMetas(metas); } catch (e) { /* reintenta luego */ } }
      return;
    }
    // adoptar backend solo si tiene forma de metas (protege de respuestas inesperadas)
    if (Array.isArray(serverMetas) && serverMetas.every(esMetaValida)) {
      metas = serverMetas; Metas.set(metas);
    }
  }

  function esMetaValida(m) {
    return m && typeof m === 'object' && 'nombre' in m && 'objetivo' in m;
  }

  // Empuja las metas al backend; marca pendiente si no hay red.
  async function pushMetas() {
    try { await Sheets.guardarMetas(metas); localStorage.removeItem(PEND_METAS); return true; }
    catch (e) { localStorage.setItem(PEND_METAS, '1'); return false; }
  }

  // ------------------------------------------------------------
  // KPIs
  // ------------------------------------------------------------
  function renderKPIs(txs, resumen) {
    const ingresos = sumar(txs, 'ingreso');
    const gastos   = sumar(txs, 'gasto');
    const neto     = ingresos - gastos;

    const esMesActual = mesActual === mesActualYYYYMM();

    // Fase 3: "Disponible/día" solo sobre presupuesto VARIABLE (descuenta los fijos:
    // suscripciones/gym/internet/universidad ya están comprometidos, no son "para gastar hoy").
    const porCat = gastosPorCategoria(txs);
    let presupuestoVariable = 0, gastadoVariable = 0;
    Object.entries(CONFIG.PRESUPUESTO).forEach(([cat, limite]) => {
      if (esCategoriaFija(cat)) return;
      presupuestoVariable += limite;
      gastadoVariable += (porCat[cat] || 0);
    });
    const gastadoFijo = gastos - Object.keys(porCat).filter(c => !esCategoriaFija(c)).reduce((a, c) => a + porCat[c], 0);

    const dias = esMesActual ? diasRestantesMes() : 0;
    const porDia = esMesActual && dias > 0 ? Math.max(0, presupuestoVariable - gastadoVariable) / dias : null;

    animarMoneda($('#kpiIngresos'), ingresos);
    animarMoneda($('#kpiGastos'), gastos);
    animarMoneda($('#kpiNeto'), neto);
    $('#kpiNeto').dataset.color = neto >= 0 ? 'green' : 'pink';

    if (porDia === null) { $('#kpiPorDia').textContent = '—'; }
    else { animarMoneda($('#kpiPorDia'), porDia); }
    $('#kpiDias').textContent = esMesActual ? dias : '—';

    const nota = $('#kpiPorDiaNota');
    if (nota) nota.textContent = (porDia !== null && gastadoFijo > 0) ? `sin contar ${fmtMoneda(gastadoFijo)} en fijos` : '';

    // Fase 5: comparación vs. mes anterior (usa el resumen de 6 meses, ya cargado)
    renderDelta('#kpiIngresosDelta', resumen, 'ingreso', true);
    renderDelta('#kpiGastosDelta', resumen, 'gasto', false);
  }

  // masEsMejor: true si un aumento es bueno (ingresos), false si un aumento es malo (gastos).
  function deltaVsMesAnterior(resumen, mes, campo) {
    if (!resumen || !resumen.length) return null;
    const idx = resumen.findIndex(m => m.mes === mes);
    if (idx <= 0) return null; // sin mes anterior en la ventana de 6 meses
    const actual = resumen[idx][campo];
    const anterior = resumen[idx - 1][campo];
    if (!anterior) return null; // evita division por cero / ruido con datos incompletos
    return ((actual - anterior) / anterior) * 100;
  }

  function renderDelta(selector, resumen, campo, masEsMejor) {
    const el = $(selector);
    if (!el) return;
    const d = deltaVsMesAnterior(resumen, mesActual, campo);
    if (d === null) { el.hidden = true; return; }
    const sube = d >= 0;
    const bueno = sube === masEsMejor;
    el.hidden = false;
    el.textContent = `${sube ? '▲' : '▼'} ${Math.abs(Math.round(d))}% vs mes ant.`;
    el.className = 'kpi-delta mono ' + (bueno ? 'good' : 'bad');
  }

  // ------------------------------------------------------------
  // Alertas de presupuesto
  // ------------------------------------------------------------
  function renderAlertas(txs) {
    const cont = $('#alertas');
    const porCat = gastosPorCategoria(txs);
    const alertas = [];
    for (const [cat, limite] of Object.entries(CONFIG.PRESUPUESTO)) {
      const gastado = porCat[cat] || 0;
      if (gastado > limite) {
        const exceso = gastado - limite;
        alertas.push(`⚠ ${cat}: ${fmtMoneda(gastado)} de ${fmtMoneda(limite)} (excedido ${fmtMoneda(exceso)})`);
      }
    }
    cont.innerHTML = alertas.map(a => `<div class="alerta">${a}</div>`).join('');
    cont.hidden = alertas.length === 0;
  }

  // ------------------------------------------------------------
  // Tabla de transacciones (paginada)
  // ------------------------------------------------------------
  function renderTabla() {
    const list = $('#txList');
    $('#txCount').textContent = `${txMes.length} este mes`;

    if (!txMes.length) {
      list.innerHTML = `<div class="empty-illu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7l2-3h14l2 3v3H3z"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/><path d="M9 13h6"/>
        </svg>
        <span>Sin transacciones este mes</span>
      </div>`;
      $('#txPagina').textContent = '1 / 1';
      $('#txPrev').disabled = true; $('#txNext').disabled = true;
      return;
    }

    const porPag = CONFIG.TX_POR_PAGINA;
    const totalPags = Math.ceil(txMes.length / porPag);
    pagina = Math.min(pagina, totalPags);
    const slice = txMes.slice((pagina - 1) * porPag, pagina * porPag);

    list.innerHTML = slice.map(t => {
      const info = infoCategoria(t.categoria);
      const signo = t.tipo === 'ingreso' ? '+' : '−';
      const clase = t.tipo === 'ingreso' ? 'monto-ingreso' : 'monto-gasto';
      const bg = info.color + '22';
      const claveRec = `${t.categoria}|${Math.round(t.monto)}`;
      const esRecurrente = t.tipo === 'gasto' && recurrentesSet.has(claveRec);
      const badgeRec = esRecurrente ? ' <span class="tx-recurrente" title="Gasto recurrente detectado (se repite mes a mes)">🔁</span>' : '';
      return `
        <div class="tx-row" data-id="${t.id}">
          <span class="tx-badge" style="background:${bg};color:${info.color}">${info.icon} ${t.categoria}</span>
          <span class="tx-info">
            <span class="tx-desc">${t.descripcion || '<span style="color:var(--text-muted)">—</span>'}${badgeRec}</span>
            <span class="tx-fecha">${t.fecha}</span>
          </span>
          <span class="tx-monto ${clase}">${signo} ${fmtMoneda(t.monto).replace('S/ ', '')}</span>
          <button class="tx-del" data-id="${t.id}" title="Borrar">✕</button>
        </div>`;
    }).join('');

    $('#txPagina').textContent = `${pagina} / ${totalPags}`;
    $('#txPrev').disabled = pagina <= 1;
    $('#txNext').disabled = pagina >= totalPags;

    list.querySelectorAll('.tx-del').forEach(btn => {
      btn.addEventListener('click', () => borrarTx(btn.dataset.id));
    });
  }

  async function borrarTx(id) {
    const t = txMes.find(x => x.id === id);
    if (!t) return;
    if (!confirm(`¿Borrar "${t.categoria} · ${fmtMoneda(t.monto)}"?`)) return;
    loading.hidden = false;
    try {
      await Sheets.borrar(id);
      mostrarToast('✓ Borrado', 'ok');
      await cargar();
    } catch (err) {
      mostrarToast('✗ No se pudo borrar: ' + err.message, 'error');
      loading.hidden = true;
    }
  }

  // ------------------------------------------------------------
  // Metas de ahorro
  // ------------------------------------------------------------
  function iconoMeta(nombre) {
    const n = nombre.toLowerCase();
    if (n.includes('laptop') || n.includes('pc') || n.includes('legion')) return '💻';
    if (n.includes('emergencia') || n.includes('fondo')) return '🛡️';
    if (n.includes('viaje') || n.includes('vacac')) return '✈️';
    if (n.includes('auto') || n.includes('moto') || n.includes('carro')) return '🚗';
    return '🎯';
  }

  function renderMetas(resumen) {
    if (resumen) ultimoResumen = resumen;
    // "Ahorro neto acumulado" = neto de todo el historial (ingresos - gastos)
    const ahorroTotal = (resumen || []).reduce((a, m) => a + (m.ingreso - m.gasto), 0);
    const cont = $('#metasList');

    if (!metas.length) {
      cont.innerHTML = `<div class="meta-empty">Aún no tienes metas. Pulsa “+ Meta” para crear una.</div>`;
      return;
    }

    cont.innerHTML = metas.map((meta, i) => {
      const actual = meta.actual || 0;
      const pct = meta.objetivo > 0 ? Math.min(100, Math.round((actual / meta.objetivo) * 100)) : 0;
      return `
        <div class="meta" data-i="${i}">
          <div class="meta-top">
            <span class="meta-ico">${iconoMeta(meta.nombre)}</span>
            <span class="meta-nombre">${meta.nombre}</span>
            <span class="meta-vals">${fmtMoneda(actual)} / ${fmtMoneda(meta.objetivo)} · <b>${pct}%</b></span>
            <button class="meta-edit" data-edit="${i}" title="Editar meta" aria-label="Editar meta">✎</button>
          </div>
          <div class="meta-bar"><div class="meta-fill" data-pct="${pct}" style="width:0"></div></div>
        </div>`;
    }).join('');

    if (resumen) {
      cont.insertAdjacentHTML('beforeend',
        `<div class="ahorro-hero">
           <span class="label">💰 Ahorro neto acumulado</span>
           <span class="val">${fmtMoneda(ahorroTotal)}</span>
         </div>`);
    }

    cont.querySelectorAll('.meta-edit').forEach(b =>
      b.addEventListener('click', () => abrirMetaEditor(+b.dataset.edit)));

    requestAnimationFrame(() => {
      cont.querySelectorAll('.meta-fill').forEach(f => { f.style.width = f.dataset.pct + '%'; });
    });
  }

  // ------------------------------------------------------------
  // Editor de metas (añadir / editar / eliminar) — guardado local
  // ------------------------------------------------------------
  const metaOverlay = $('#metaOverlay');
  let metaEditIndex = null;

  function abrirMetaEditor(i) {
    metaEditIndex = (typeof i === 'number') ? i : null;
    const m = metaEditIndex !== null ? metas[metaEditIndex] : { nombre: '', objetivo: '', actual: '' };
    $('#metaTitle').textContent = metaEditIndex !== null ? 'Editar meta' : 'Nueva meta';
    $('#metaNombre').value = m.nombre || '';
    $('#metaObjetivo').value = m.objetivo || '';
    $('#metaActual').value = m.actual || '';
    $('#metaEstado').textContent = ''; $('#metaEstado').className = 'cfg-estado';
    $('#metaEliminar').hidden = metaEditIndex === null;
    metaOverlay.hidden = false;
    $('#metaNombre').focus();
  }
  function cerrarMetaEditor() { metaOverlay.hidden = true; }

  async function guardarMeta() {
    const nombre = $('#metaNombre').value.trim();
    const objetivo = parseMonto($('#metaObjetivo').value);
    const actual = parseMonto($('#metaActual').value);
    if (!nombre) { $('#metaEstado').textContent = 'Ponle un nombre a la meta'; $('#metaEstado').className = 'cfg-estado error'; return; }
    if (!objetivo || objetivo <= 0) { $('#metaEstado').textContent = 'El objetivo debe ser mayor a 0'; $('#metaEstado').className = 'cfg-estado error'; return; }
    const meta = { nombre, objetivo, actual: actual || 0 };
    if (metaEditIndex !== null) metas[metaEditIndex] = meta; else metas.push(meta);
    Metas.set(metas);
    cerrarMetaEditor();
    renderMetas(ultimoResumen);
    const ok = await pushMetas();
    mostrarToast(ok ? '✓ Meta guardada' : '✓ Guardada (offline; se sincroniza al reconectar)', 'ok');
  }
  async function eliminarMeta() {
    if (metaEditIndex === null) return;
    const m = metas[metaEditIndex];
    if (!confirm(`¿Eliminar la meta "${m.nombre}"?`)) return;
    metas.splice(metaEditIndex, 1);
    Metas.set(metas);
    cerrarMetaEditor();
    renderMetas(ultimoResumen);
    const ok = await pushMetas();
    mostrarToast(ok ? 'Meta eliminada' : 'Eliminada (offline; se sincroniza al reconectar)', 'ok');
  }

  $('#btnAddMeta').addEventListener('click', () => abrirMetaEditor(null));
  $('#metaGuardar').addEventListener('click', guardarMeta);
  $('#metaEliminar').addEventListener('click', eliminarMeta);
  $('#metaClose').addEventListener('click', cerrarMetaEditor);
  metaOverlay.addEventListener('click', (e) => { if (e.target === metaOverlay) cerrarMetaEditor(); });

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  function sumar(txs, tipo) {
    return txs.filter(t => t.tipo === tipo).reduce((a, t) => a + t.monto, 0);
  }
  function gastosPorCategoria(txs) {
    const acc = {};
    txs.filter(t => t.tipo === 'gasto').forEach(t => { acc[t.categoria] = (acc[t.categoria] || 0) + t.monto; });
    return acc;
  }
  function animarMoneda(el, valor) {
    if (!window.gsap) { el.textContent = fmtMoneda(valor); return; }
    const obj = { v: 0 };
    gsap.to(obj, { v: valor, duration: 0.8, ease: 'power2.out', onUpdate: () => { el.textContent = fmtMoneda(obj.v); } });
  }

  // ------------------------------------------------------------
  // Navegación de mes
  // ------------------------------------------------------------
  function setMes(yyyymm) { mesActual = yyyymm; mesLabel.textContent = nombreMes(yyyymm); cargar(); }
  function moverMes(delta) {
    let [y, m] = mesActual.split('-').map(Number);
    m += delta;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    setMes(`${y}-${String(m).padStart(2, '0')}`);
  }
  $('#mesPrev').addEventListener('click', () => moverMes(-1));
  $('#mesNext').addEventListener('click', () => moverMes(1));
  $('#txPrev').addEventListener('click', () => { if (pagina > 1) { pagina--; renderTabla(); } });
  $('#txNext').addEventListener('click', () => { pagina++; renderTabla(); });
  $('#btnRefresh').addEventListener('click', cargar);

  // ------------------------------------------------------------
  // Configuración (conexión) — igual que el form
  // ------------------------------------------------------------
  function abrirConfig() {
    const c = Conexion.get();
    $('#cfgUrl').value = c.url; $('#cfgToken').value = c.token;
    $('#cfgEstado').textContent = ''; $('#cfgEstado').className = 'cfg-estado';
    $('#cfgOverlay').hidden = false;
  }
  $('#btnConfig').addEventListener('click', abrirConfig);
  // Cerrar overlays sin obligar a llenarlos: X, clic afuera o Esc.
  $('#btnCerrarCfg').addEventListener('click', () => { $('#cfgOverlay').hidden = true; });
  $('#cfgOverlay').addEventListener('click', (e) => { if (e.target === $('#cfgOverlay')) $('#cfgOverlay').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!metaOverlay.hidden) cerrarMetaEditor();
    else if (!$('#cfgOverlay').hidden) $('#cfgOverlay').hidden = true;
  });
  $('#btnGuardarCfg').addEventListener('click', async () => {
    const url = $('#cfgUrl').value.trim(), token = $('#cfgToken').value.trim();
    if (!url || !token) { $('#cfgEstado').textContent = 'Completa URL y token'; $('#cfgEstado').className = 'cfg-estado error'; return; }
    $('#btnGuardarCfg').disabled = true;
    $('#cfgEstado').textContent = 'Probando…'; $('#cfgEstado').className = 'cfg-estado';
    Conexion.set(url, token);
    try {
      await Sheets.probar();
      $('#cfgEstado').textContent = '✓ Conectado'; $('#cfgEstado').className = 'cfg-estado ok';
      setTimeout(() => { $('#cfgOverlay').hidden = true; cargar(); }, 700);
    } catch (err) {
      $('#cfgEstado').textContent = '✗ No conecta: ' + err.message; $('#cfgEstado').className = 'cfg-estado error';
    } finally { $('#btnGuardarCfg').disabled = false; }
  });

  // ------------------------------------------------------------
  // Tilt 3D (solo mouse fino, respeta reduce-motion)
  // ------------------------------------------------------------
  function attachTilt() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.tilt').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--rx', (px * 9).toFixed(2) + 'deg');
        el.style.setProperty('--ry', (-py * 9).toFixed(2) + 'deg');
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  mesLabel.textContent = nombreMes(mesActual);
  if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.from('.kpi', { opacity: 0, y: 22, scale: 0.96, duration: 0.5, stagger: 0.06, ease: 'power2.out' });
    gsap.from('.charts-grid, .tx-card, .metas-card', { opacity: 0, y: 28, duration: 0.55, stagger: 0.12, delay: 0.2, ease: 'power2.out' });
  }
  attachTilt();
  renderMetas(null);   // las metas son locales: se ven aunque no haya conexión
  cargar();
})();
