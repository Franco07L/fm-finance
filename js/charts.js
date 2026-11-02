/* ============================================================
   FM_FINANCE — charts.js  (versión liviana)
   Gráficos en HTML/CSS/SVG puro: sin Chart.js (≈200 KB menos),
   funcionan igual sin conexión y no necesitan <canvas>.
   Misma API que antes: Charts.renderDonut(el, porCategoria)
                        Charts.renderBar(el, meses, saldoActual)
   ============================================================ */

const Charts = {
  /** Dona de gastos por categoría. `el` es un contenedor (<div>). */
  renderDonut(el, porCategoria) {
    const grupos = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    const total = grupos.reduce((a, [, v]) => a + v, 0);
    const cuenta = document.getElementById('catCount');
    if (cuenta) cuenta.textContent = `${grupos.length} categoría${grupos.length === 1 ? '' : 's'}`;

    if (!grupos.length) {
      el.innerHTML = `<div class="empty-state">${icono('chart')}<strong>Todo empieza con un registro</strong><p>Tu distribución aparecerá cuando registres un gasto este mes.</p></div>`;
      return;
    }

    let acc = 0;
    const tramos = grupos.map(([nombre, v]) => {
      const ini = acc / total * 100; acc += v;
      return `${infoCategoria(nombre).color} ${ini.toFixed(2)}% ${(acc / total * 100).toFixed(2)}%`;
    }).join(',');

    el.innerHTML = `
      <div class="category-body">
        <div class="donut" style="background:conic-gradient(${tramos})" role="img"
             aria-label="Gasto total ${esc(fmtMoneda(total))}; ${grupos.length} categorías">
          <div class="donut-center"><b class="money">${esc(fmtMoneda(total))}</b>
            <small>${grupos.length === 1 ? '100 % · una categoría' : 'Total del mes'}</small></div>
        </div>
        <div class="category-legend">
          ${grupos.map(([nombre, v]) => `
            <div class="category-line" style="--c:${infoCategoria(nombre).color}">
              <span class="category-dot"></span>
              <span class="cat-name">${esc(nombre)}</span>
              <span class="category-amount money">${esc(fmtMoneda(v))}</span>
              <span class="category-pct">${Math.round(v / total * 100)}%</span>
            </div>`).join('')}
        </div>
      </div>`;
  },

  /**
   * Barras ingresos/gastos por mes + trayectoria del saldo acumulado.
   * @param {HTMLElement} el
   * @param {Array} meses  [{mes:'2026-06', ingreso, gasto}, ...]
   * @param {number|null} saldoActual  Saldo total AHORA: ancla la trayectoria
   *   (el último punto = saldo real; hacia atrás se restan los deltas de cada mes).
   */
  renderBar(el, meses, saldoActual) {
    const nota = document.getElementById('histCount');
    if (nota) nota.textContent = `Últimos 6 meses · ${meses.length} ${meses.length === 1 ? 'mes disponible' : 'meses disponibles'}`;

    if (!meses.length) {
      el.innerHTML = `<div class="empty-state">${icono('calendar')}<strong>Tu historia está por empezar</strong><p>No hay movimientos en esta ventana de seis meses.</p></div>`;
      return;
    }

    const max = Math.max(1, ...meses.map(m => Math.max(m.ingreso, m.gasto)));
    const paso = Math.pow(10, Math.floor(Math.log10(max)));          // escala "redonda"
    const techo = Math.ceil(max / paso / 4) * paso * 4;              // múltiplo de 4 pasos
    const num = (v) => Number(v).toLocaleString('es-PE', { maximumFractionDigits: 0 });
    const abrev = (m) => MESES_ES[Number(m.split('-')[1]) - 1].slice(0, 3);

    const barras = meses.map((m) => `
      <div class="bar-group" tabindex="0" title="${esc(nombreMes(m.mes))} · Ingresos ${esc(fmtMoneda(m.ingreso))} · Gastos ${esc(fmtMoneda(m.gasto))}"
           aria-label="${esc(nombreMes(m.mes))}, ingresos ${esc(fmtMoneda(m.ingreso))}, gastos ${esc(fmtMoneda(m.gasto))}">
        <div class="bar ${m.ingreso ? '' : 'zero'}" style="height:${(m.ingreso / techo * 100).toFixed(1)}%"></div>
        <div class="bar expense ${m.gasto ? '' : 'zero'}" style="height:${(m.gasto / techo * 100).toFixed(1)}%"></div>
      </div>`).join('');

    // Trayectoria del saldo (línea SVG)
    let tendencia = '';
    if (typeof saldoActual === 'number') {
      let ac = saldoActual - meses.reduce((a, m) => a + (m.ingreso - m.gasto), 0);
      const serie = meses.map((m) => ({ mes: m.mes, saldo: (ac += (m.ingreso - m.gasto)) }));
      const vals = serie.map(s => s.saldo);
      const mn = Math.min(...vals), mx = Math.max(...vals), rango = (mx - mn) || 1;
      const x = (i) => serie.length === 1 ? 200 : 50 + i * (300 / (serie.length - 1));
      const y = (v) => 22 + (1 - (v - mn) / rango) * 26;
      const puntos = serie.map((s, i) => `${x(i).toFixed(1)},${y(s.saldo).toFixed(1)}`).join(' ');
      tendencia = `
        <div class="balance-trend">
          <div class="trend-head"><span>Saldo acumulado</span><b class="green money">${esc(fmtMoneda(serie[serie.length - 1].saldo))}</b></div>
          <svg class="trend-svg" viewBox="0 0 400 78" role="img"
               aria-label="Saldo acumulado por mes: ${esc(serie.map(s => nombreMes(s.mes) + ', ' + fmtMoneda(s.saldo)).join('; '))}">
            ${serie.length > 1 ? `<polyline fill="none" stroke="#00ffb0" stroke-width="1.8" points="${puntos}"/>` : ''}
            ${serie.map((s, i) => `
              <circle cx="${x(i).toFixed(1)}" cy="${y(s.saldo).toFixed(1)}" r="3.5" fill="#00ffb0"/>
              <text class="value-label" x="${x(i).toFixed(1)}" y="${(y(s.saldo) - 9).toFixed(1)}" text-anchor="middle">${esc(fmtMoneda(s.saldo))}</text>
              <text x="${x(i).toFixed(1)}" y="68" text-anchor="middle">${abrev(s.mes)}</text>`).join('')}
          </svg>
        </div>`;
    }

    el.innerHTML = `
      <span class="plot-unit">Importes en S/</span>
      <div class="plot-area" role="img" aria-label="Comparación mensual de ingresos y gastos">
        <div class="y-scale">${[4, 3, 2, 1, 0].map(i => `<span>${num(techo * i / 4)}</span>`).join('')}</div>
        <div class="bar-plot">${barras}</div>
      </div>
      <div class="x-labels">${meses.map(m => `<span>${abrev(m.mes)} ${m.mes.slice(2, 4)}</span>`).join('')}</div>
      ${tendencia}
      <p class="chart-caption">${meses.length < 6 ? 'Se muestran solo los meses con movimientos.' : 'Historial de los seis últimos meses.'}</p>`;
  },
};
