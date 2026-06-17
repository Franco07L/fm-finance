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
  function iconoMeta(nombre) {
    const n = nombre.toLowerCase();
    if (n.includes('laptop') || n.includes('pc') || n.includes('legion')) return '💻';
    if (n.includes('emergencia') || n.includes('fondo')) return '🛡️';
    if (n.includes('viaje') || n.includes('vacac')) return '✈️';
    if (n.includes('auto') || n.includes('moto') || n.includes('carro')) return '🚗';
    return '🎯';
  }

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
            <span class="meta-ico">${iconoMeta(meta.nombre)}</span>
            <span class="meta-nombre">${meta.nombre}</span>
            <span class="meta-vals">${fmtMoneda(actual)} / ${fmtMoneda(meta.objetivo)} · <b>${pct}%</b></span>
          </div>
          <div class="meta-bar"><div class="meta-fill" data-pct="${pct}" style="width:0"></div></div>
        </div>`;
    }).join('');

    if (CONFIG.METAS.length) {
      cont.insertAdjacentHTML('beforeend',
        `<div class="ahorro-hero">
           <span class="label">💰 Ahorro neto acumulado</span>
           <span class="val">${fmtMoneda(ahorroTotal)}</span>
         </div>`);
    }

    // animar barras (width 0 → pct)
    requestAnimationFrame(() => {
      cont.querySelectorAll('.meta-fill').forEach(f => { f.style.width = f.dataset.pct + '%'; });
    });
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
  cargar();
})();
