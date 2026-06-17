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
      const [txs, resumen] = await Promise.all([Sheets.leer(mesActual), Sheets.resumen()]);
      txMes = txs;
      pagina = 1;
      renderKPIs(txs);
      renderAlertas(txs);
      Charts.renderDonut($('#chartDonut'), gastosPorCategoria(txs));
      Charts.renderBar($('#chartBar'), resumen);
      renderTabla();
      renderMetas(resumen);
    } catch (err) {
      mostrarToast('✗ Error al cargar: ' + err.message, 'error', 4000);
    } finally {
      loading.hidden = true;
    }
  }

  // ------------------------------------------------------------
  // KPIs
  // ------------------------------------------------------------
  function renderKPIs(txs) {
    const ingresos = sumar(txs, 'ingreso');
    const gastos   = sumar(txs, 'gasto');
    const neto     = ingresos - gastos;

    const esMesActual = mesActual === mesActualYYYYMM();
    const totalPpto = Object.values(CONFIG.PRESUPUESTO).reduce((a, b) => a + b, 0);
    const dias = esMesActual ? diasRestantesMes() : 0;
    const porDia = esMesActual && dias > 0 ? Math.max(0, totalPpto - gastos) / dias : null;

    animarMoneda($('#kpiIngresos'), ingresos);
    animarMoneda($('#kpiGastos'), gastos);
    animarMoneda($('#kpiNeto'), neto);
    $('#kpiNeto').dataset.color = neto >= 0 ? 'green' : 'pink';

    if (porDia === null) { $('#kpiPorDia').textContent = '—'; }
    else { animarMoneda($('#kpiPorDia'), porDia); }
    $('#kpiDias').textContent = esMesActual ? dias : '—';
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
      list.innerHTML = '<div class="tx-empty">Sin transacciones este mes</div>';
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
      return `
        <div class="tx-row" data-id="${t.id}">
          <span class="tx-badge" style="background:${bg};color:${info.color}">${info.icon} ${t.categoria}</span>
          <span class="tx-info">
            <span class="tx-desc">${t.descripcion || '<span style="color:var(--text-muted)">—</span>'}</span>
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
  function renderMetas(resumen) {
    // "actual" disponible = neto acumulado de todo el historial (ingresos - gastos)
    const ahorroTotal = resumen.reduce((a, m) => a + (m.ingreso - m.gasto), 0);
    const cont = $('#metasList');
    cont.innerHTML = CONFIG.METAS.map(meta => {
      const actual = meta.actual || 0;
      const pct = Math.min(100, Math.round((actual / meta.objetivo) * 100));
      return `
        <div class="meta">
          <div class="meta-top">
            <span>${meta.nombre}</span>
            <span class="meta-vals">${fmtMoneda(actual)} / ${fmtMoneda(meta.objetivo)} · ${pct}%</span>
          </div>
          <div class="meta-bar"><div class="meta-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');

    // dato útil: ahorro neto acumulado
    if (CONFIG.METAS.length) {
      cont.insertAdjacentHTML('beforeend',
        `<p style="margin-top:14px;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">
           Ahorro neto acumulado (todo el historial): <b style="color:var(--accent-green)">${fmtMoneda(ahorroTotal)}</b>
         </p>`);
    }
  }

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
  cargar();
})();
