/* ============================================================
   FM_FINANCE — charts.js
   Gráficos con Chart.js 4 (tema oscuro global).
   ============================================================ */

if (window.Chart) {
  Chart.defaults.color = '#8888AA';
  Chart.defaults.borderColor = 'rgba(124,111,247,0.15)';
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.padding = 14;
}

const Charts = {
  _donut: null,
  _bar: null,

  /**
   * Dona de gastos por categoría.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} porCategoria  { 'Alimentación': 320, ... }
   */
  renderDonut(canvas, porCategoria) {
    const labels = Object.keys(porCategoria);
    const data = labels.map(l => porCategoria[l]);
    const colors = labels.map(l => infoCategoria(l).color);

    if (this._donut) this._donut.destroy();

    if (!labels.length) { this._mensajeVacio(canvas, 'Sin gastos este mes'); return; }

    this._donut = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: '#0D0D1A',
          borderWidth: 3,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { color: '#8888AA' } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}: ${fmtMoneda(c.parsed)}`,
            },
          },
        },
      },
    });
  },

  /**
   * Barras: últimos meses, ingresos vs gastos.
   * @param {HTMLCanvasElement} canvas
   * @param {Array} meses  [{mes:'2026-06', ingreso, gasto}, ...]
   */
  renderBar(canvas, meses) {
    const labels = meses.map(m => {
      const [y, mm] = m.mes.split('-');
      return MESES_ES[Number(mm) - 1].slice(0, 3) + " '" + y.slice(2);
    });

    if (this._bar) this._bar.destroy();

    if (!meses.length) { this._mensajeVacio(canvas, 'Aún sin historial'); return; }

    this._bar = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: meses.map(m => m.ingreso), backgroundColor: '#00D4FF', borderRadius: 5, maxBarThickness: 26 },
          { label: 'Gastos',   data: meses.map(m => m.gasto),   backgroundColor: '#FF6B9D', borderRadius: 5, maxBarThickness: 26 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtMoneda(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => 'S/ ' + v } },
        },
      },
    });
  },

  _mensajeVacio(canvas, texto) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.fillStyle = '#444466';
    ctx.font = "13px 'JetBrains Mono', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  },
};
