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

  // (CacheDash vive en sheets.js — compartido con form.js, que precarga
  // el mes actual en segundo plano mientras el usuario llena el formulario)

  // ------------------------------------------------------------
  // Carga principal
  // ------------------------------------------------------------
  async function cargar() {
    if (!Conexion.configurada()) { abrirConfig(); return; }

    const mesDeEstaCarga = mesActual; // por si cambia de mes mientras esto sigue en vuelo
    const cache = CacheDash.get(mesDeEstaCarga);
    if (cache) {
      aplicarDatosDashboard(cache); // instantáneo: se ve algo YA, aunque esté desactualizado
    } else {
      loading.hidden = false; // sin nada que mostrar todavía: sí bloquear con el spinner
    }

    try {
      // UNA sola llamada al backend (antes eran 5 en paralelo: Apps Script a
      // veces rechaza tantas invocaciones simultáneas y devuelve HTML de error
      // en vez de JSON). El backend hace una única lectura de la hoja y arma
      // todo: transacciones del mes, resumen, metas, saldo y ventana de recurrentes.
      const ventanaRecurrentes = mesesAnteriores(mesDeEstaCarga, 3).join(',');
      const d = await Sheets.dashboard(mesDeEstaCarga, ventanaRecurrentes);
      CacheDash.set(mesDeEstaCarga, d);
      await sincronizarMetas(d.metas);
      if (mesActual === mesDeEstaCarga) aplicarDatosDashboard(d); // sigue en el mismo mes: refresca con datos frescos
      precargarVecinos(mesDeEstaCarga); // en segundo plano: cambiar de mes será instantáneo
    } catch (err) {
      if (!cache) mostrarToast('✗ Error al cargar: ' + err.message, 'error', 4000);
      // si había caché, se queda mostrando eso — mejor un dato viejo que una pantalla rota
    } finally {
      loading.hidden = true;
    }
  }

  // Trae en background el mes anterior y el siguiente y los deja en caché.
  // Como el servidor ya tiene la lectura cacheada, estas llamadas son baratas
  // — y cuando el usuario pulse ◀ o ▶ el mes aparece al instante.
  function precargarVecinos(mes) {
    [-1, 1].forEach((delta) => {
      const m = desplazarMes(mes, delta);
      if (CacheDash.get(m)) return; // ya lo tenemos
      CacheDash.precargar(m, mesesAnteriores(m, 3).join(','));
    });
  }

  function desplazarMes(yyyymm, delta) {
    let [y, m] = yyyymm.split('-').map(Number);
    m += delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    return y + '-' + String(m).padStart(2, '0');
  }

  function aplicarDatosDashboard(d) {
    const txs = d.tx, resumen = d.resumen;
    txMes = txs;
    pagina = 1;
    saldoTotalActual = typeof d.saldo === 'number' ? d.saldo : null;
    recurrentesSet = calcularRecurrentes(d.txsRecientes);
    renderSaldoTotal(saldoTotalActual);
    renderKPIs(txs, resumen);
    renderAlertas(txs);
    Charts.renderDonut($('#chartDonut'), gastosPorCategoria(txs));
    Charts.renderBar($('#chartBar'), resumen, saldoTotalActual);
    renderTabla();
    renderMetas(resumen);
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

    if (porDia === null) { $('#kpiPorDia').textContent = '—'; $('#kpiPorDia')._v = undefined; }
    else { animarMoneda($('#kpiPorDia'), porDia); }

    // "N días restantes" + barra: solo tiene sentido en el mes en curso
    const wrap = $('#kpiDiasWrap');
    wrap.hidden = !esMesActual;
    if (esMesActual) {
      const hoy = new Date();
      const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      $('#kpiDias').textContent = dias;
      $('#kpiDiasBar').style.width = Math.max(2, Math.round(dias / diasDelMes * 100)) + '%';
    }

    const nota = $('#kpiPorDiaNota');
    if (nota) {
      nota.textContent = porDia === null
        ? 'Solo se calcula para el mes en curso.'
        : 'Presupuesto variable' + (gastadoFijo > 0 ? ` · excluye ${fmtMoneda(gastadoFijo)} en fijos` : '');
    }

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
      if (gastado > limite) alertas.push({ cat, gastado, limite, exceso: gastado - limite });
    }
    alertas.sort((a, b) => b.exceso - a.exceso);

    if (!alertas.length) {
      cont.className = 'card metric alertas-card ok';
      cont.removeAttribute('role'); cont.removeAttribute('tabindex'); cont.removeAttribute('aria-expanded');
      cont.innerHTML = `<span class="metric-icon green">${icono('check')}</span>
        <div class="metric-copy"><p class="metric-label">Sin excesos</p><p class="metric-sub">Categorías dentro del presupuesto</p></div>`;
      return;
    }
    // Hay excesos: se muestra el mayor; tocar la tarjeta despliega el detalle de todos.
    const [a0] = alertas;
    cont.className = 'card metric alertas-card hay';
    cont.setAttribute('role', 'button'); cont.setAttribute('tabindex', '0'); cont.setAttribute('aria-expanded', 'false');
    cont.innerHTML = `<span class="metric-icon amber">${icono('alert')}</span>
      <div class="metric-copy">
        <p class="metric-label">${esc(a0.cat)}${alertas.length > 1 ? ` y ${alertas.length - 1} más` : ''}</p>
        <p class="metric-sub">${fmtMoneda(a0.exceso)} sobre el presupuesto</p>
      </div>
      <ul class="alert-list" hidden>${alertas.map(a =>
        `<li>${esc(a.cat)}: ${fmtMoneda(a.gastado)} de ${fmtMoneda(a.limite)} (excedido ${fmtMoneda(a.exceso)})</li>`).join('')}</ul>`;
  }

  // Alterna el detalle de excesos (clic o Enter/Espacio sobre la tarjeta).
  (function () {
    const cont = $('#alertas');
    const alternar = () => {
      const lista = cont.querySelector('.alert-list');
      if (!lista) return;
      lista.hidden = !lista.hidden;
      cont.setAttribute('aria-expanded', String(!lista.hidden));
    };
    cont.addEventListener('click', alternar);
    cont.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
  })();

  // ------------------------------------------------------------
  // Tabla de transacciones (paginada)
  // ------------------------------------------------------------
  function renderTabla() {
    const list = $('#txList');
    $('#txCount').textContent = `${txMes.length} este mes`;

    $('.tx-columns').hidden = !txMes.length;
    $('.tx-pager').hidden = txMes.length <= CONFIG.TX_POR_PAGINA;

    if (!txMes.length) {
      list.innerHTML = `<div class="empty-state">${icono('empty')}<strong>Un mes por escribir</strong>
        <p>Aún no tienes movimientos en ${esc(nombreMes(mesActual).toLowerCase())}. Empieza con tu primer registro.</p>
        <a href="form.html" class="primary">${icono('plus')}Registrar movimiento</a></div>`;
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
      const claveRec = `${t.categoria}|${Math.round(t.monto)}`;
      const esRecurrente = t.tipo === 'gasto' && recurrentesSet.has(claveRec);
      const badgeRec = esRecurrente ? ` <span class="tx-recurrente" title="Gasto recurrente detectado (se repite mes a mes)" aria-label="Gasto recurrente">${icono('repeat')}</span>` : '';
      const nombre = t.descripcion || t.categoria;
      return `
        <article class="tx-row" data-id="${esc(t.id)}">
          <time class="tx-date" datetime="${esc(t.fecha)}">${esc(fechaCorta(t.fecha))}</time>
          <div class="tx-category" style="--c:${info.color}">${icono(info.svg)}<span>${esc(t.categoria)}</span></div>
          <p class="tx-desc${t.descripcion ? '' : ' vacia'}">${t.descripcion ? esc(t.descripcion) : 'Sin descripción'}${badgeRec}</p>
          <span class="tx-monto ${clase}">${signo} ${esc(fmtMoneda(t.monto))}</span>
          <button class="tx-del" data-id="${esc(t.id)}" title="Borrar" aria-label="Borrar ${esc(nombre)}">${icono('trash')}</button>
        </article>`;
    }).join('');

    $('#txPagina').textContent = `${pagina} / ${totalPags}`;
    $('#txPrev').disabled = pagina <= 1;
    $('#txNext').disabled = pagina >= totalPags;

    list.querySelectorAll('.tx-del').forEach(btn => {
      btn.addEventListener('click', () => borrarTx(btn.dataset.id));
    });
  }

  async function borrarTx(id) {
    const idx = txMes.findIndex(x => x.id === id);
    if (idx === -1) return;
    const t = txMes[idx];
    if (!confirm(`¿Borrar "${t.categoria} · ${fmtMoneda(t.monto)}"?`)) return;

    // UI optimista: Apps Script puede tardar mucho en confirmar (medido:
    // hasta 30+s en escrituras). Se actualiza la vista YA con el dato local
    // y se confirma con el backend en segundo plano.
    txMes.splice(idx, 1);
    if (typeof saldoTotalActual === 'number') {
      saldoTotalActual += (t.tipo === 'ingreso' ? -t.monto : t.monto);
      renderSaldoTotal(saldoTotalActual);
      renderMetas(ultimoResumen);   // "Ahorro neto acumulado" sigue al saldo
    }
    renderKPIs(txMes, ultimoResumen);
    renderAlertas(txMes);
    Charts.renderDonut($('#chartDonut'), gastosPorCategoria(txMes));
    renderTabla();
    mostrarToast('✓ Borrado', 'ok');

    // La caché LOCAL (localStorage) todavía tiene la tx borrada — si se
    // recarga la página antes de que termine el POST, por un instante se
    // vería otra vez. La sacamos ya mismo del snapshot local guardado.
    const cacheado = CacheDash.get(mesActual);
    if (cacheado && Array.isArray(cacheado.tx)) {
      cacheado.tx = cacheado.tx.filter(t => t.id !== id);
      if (typeof saldoTotalActual === 'number') cacheado.saldo = saldoTotalActual;
      CacheDash.set(mesActual, cacheado);
    }

    try {
      // Misma ventana que usa cargar(): el backend, con el Sheet ya abierto
      // para borrar, precalienta la caché con esta clave exacta — así la
      // próxima carga del dashboard no vuelve a pagar el costo de abrirlo.
      await Sheets.borrar(id, mesesAnteriores(mesActual, 3).join(','));
    } catch (err) {
      mostrarToast('⚠ No se pudo confirmar el borrado en el servidor', 'error');
    }
  }

  // ------------------------------------------------------------
  // Metas de ahorro
  // ------------------------------------------------------------
  // Nombre del icono SVG según la meta (el color lo da .indigo para las "de equipo").
  function iconoMeta(nombre) {
    const n = String(nombre).toLowerCase();
    if (n.includes('laptop') || n.includes('pc') || n.includes('legion')) return 'laptop';
    if (n.includes('emergencia') || n.includes('fondo')) return 'shield';
    if (n.includes('viaje') || n.includes('vacac')) return 'plane';
    if (n.includes('auto') || n.includes('moto') || n.includes('carro')) return 'bus';
    return 'target';
  }

  function renderMetas(resumen) {
    if (resumen) ultimoResumen = resumen;
    // "Ahorro neto acumulado" = saldo de TODO el historial (si ya lo conocemos)
    const ahorroTotal = typeof saldoTotalActual === 'number'
      ? saldoTotalActual
      : (resumen || []).reduce((a, m) => a + (m.ingreso - m.gasto), 0);
    const cont = $('#metasList');

    let html = '';
    if (!metas.length) {
      html = `<div class="empty-state">${icono('shield')}<strong>Dale un destino a tu ahorro</strong>
        <p>Crea una meta y ajusta cuánto llevas ahorrado.</p></div>`;
    } else {
      html = metas.map((meta, i) => {
        const actual = meta.actual || 0;
        const pct = meta.objetivo > 0 ? Math.min(100, Math.round((actual / meta.objetivo) * 100)) : 0;
        const ico = iconoMeta(meta.nombre);
        return `
        <article class="meta" data-i="${i}">
          <div class="meta-top">
            <span class="meta-ico ${ico === 'laptop' ? 'indigo' : ''}">${icono(ico)}</span>
            <h3 class="meta-nombre">${esc(meta.nombre)}</h3>
            <button class="meta-edit" data-edit="${i}" title="Editar meta" aria-label="Editar ${esc(meta.nombre)}">${icono('pencil')}</button>
          </div>
          <p class="meta-vals mono"><b>${fmtMoneda(actual)}</b> / ${fmtMoneda(meta.objetivo)}</p>
          <div class="meta-progress">
            <div class="meta-bar" role="progressbar" aria-label="${esc(meta.nombre)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
                 aria-valuetext="${esc(fmtMoneda(actual))} de ${esc(fmtMoneda(meta.objetivo))}"><div class="meta-fill" data-pct="${pct}"></div></div>
            <span class="meta-pct">${pct}%</span>
          </div>
          ${pct === 0 ? '<p class="meta-ayuda">Tu primer ahorro cuenta.</p>' : ''}
        </article>`;
      }).join('');
    }

    if (resumen || typeof saldoTotalActual === 'number') {
      html += `<div class="ahorro-hero">${icono('piggy')}<div><p class="label">Ahorro neto acumulado</p><p class="val">${fmtMoneda(ahorroTotal)}</p></div></div>`;
    }
    cont.innerHTML = html;

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
  function animarMoneda(el, valor) { animarNumero(el, valor); }

  // ------------------------------------------------------------
  // Navegación de mes
  // ------------------------------------------------------------
  function setMes(yyyymm) { mesActual = yyyymm; mesLabel.textContent = nombreMes(yyyymm); cargar(); }
  function moverMes(delta) { setMes(desplazarMes(mesActual, delta)); }
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
  // Init
  // ------------------------------------------------------------
  mesLabel.textContent = nombreMes(mesActual);
  renderMetas(null);   // las metas son locales: se ven aunque no haya conexión
  cargar();
})();
