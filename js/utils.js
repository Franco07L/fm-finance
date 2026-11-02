/* ============================================================
   FM_FINANCE — utils.js
   FUENTE ÚNICA DE VERDAD de categorías + helpers compartidos.
   (form.js, dashboard.js y charts.js leen de aquí — no dupliques.)
   ============================================================ */

const CATEGORIA_CONFIG = {
  // INGRESOS
  'Honorarios Cumbra':  { color: '#00d4ff', icon: '▲', svg: 'briefcase', tipo: 'ingreso' },
  'Beca 18':            { color: '#00d4ff', icon: '▲', svg: 'cap',       tipo: 'ingreso' },
  'Otros ingresos':     { color: '#9b86ff', icon: '▲', svg: 'coins',     tipo: 'ingreso' },
  // GASTOS — fijo:true = compromiso recurrente (se resta antes de "Disponible/día")
  'Suscripciones tech': { color: '#a18aff', icon: '▼', svg: 'monitor',   tipo: 'gasto', fijo: true },
  'Transporte':         { color: '#ffcf52', icon: '▼', svg: 'bus',       tipo: 'gasto', fijo: false },
  'Gym':                { color: '#ff6b9d', icon: '▼', svg: 'dumbbell',  tipo: 'gasto', fijo: true },
  'Internet/Celular':   { color: '#00d4ff', icon: '▼', svg: 'wifi',      tipo: 'gasto', fijo: true },
  'Alimentación':       { color: '#ff6b9d', icon: '▼', svg: 'cart',      tipo: 'gasto', fijo: false },
  'Universidad':        { color: '#ffcf52', icon: '▼', svg: 'cap',       tipo: 'gasto', fijo: true },
  'Gaming/Ocio':        { color: '#ffcf52', icon: '▼', svg: 'game',      tipo: 'gasto', fijo: false },
  'Ropa/Personal':      { color: '#ffcf52', icon: '▼', svg: 'tag',       tipo: 'gasto', fijo: false },
  'Emergencias':        { color: '#ff8299', icon: '▼', svg: 'heart',     tipo: 'gasto', fijo: false },
  'Otro':               { color: '#b2b7d1', icon: '▼', svg: 'other',     tipo: 'gasto', fijo: false },
};

/** Lista de nombres de categoría filtrada por tipo ('ingreso' | 'gasto'). */
function categoriasPorTipo(tipo) {
  return Object.keys(CATEGORIA_CONFIG).filter(k => CATEGORIA_CONFIG[k].tipo === tipo);
}

const COLORES_EXTRA = ['#9b86ff', '#00d4ff', '#ffcf52', '#ff6b9d', '#00ffb0', '#ff8299'];

/** Info de una categoría (color/icon/svg/tipo). Las categorías personalizadas
 *  (p. ej. "AQUILER") no están en el config: reciben un color estable según su
 *  nombre, así en la dona no se mezclan varias del mismo gris. */
function infoCategoria(nombre) {
  if (CATEGORIA_CONFIG[nombre]) return CATEGORIA_CONFIG[nombre];
  let h = 0; const n = String(nombre || '');
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return { color: COLORES_EXTRA[h % COLORES_EXTRA.length], icon: '•', svg: 'other', tipo: 'gasto' };
}

/* ---------- Iconos SVG (línea) — estilo Vector ---------- */
const ICON_PATHS = {
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12l9 3 9-3M12 13v4"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5.5 12.3a10 10 0 0 1 13 0M9 15.7a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1"/>',
  cart: '<path d="M2 3h3l3 13h11l3-10H6M9 10h11M9 13h10"/><circle cx="10" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  bus: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 8h14M5 13h14M8 19v2M16 19v2M12 3v5"/><path d="M8 16h1M15 16h1"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  shield: '<path d="M12 2l8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5l8-3zM12 6v10"/>',
  laptop: '<rect x="5" y="3" width="14" height="13" rx="1"/><path d="M5 16l-3 4h20l-3-4M9 20h6"/>',
  coins: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 10c0 1.7 3.6 3 8 3s8-1.3 8-3M4 15c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  calendar: '<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M8 14h1M12 14h1M16 14h1M8 18h1M12 18h1"/>',
  arrowDown: '<path d="M12 3v18M5 14l7 7 7-7"/>',
  arrowUp: '<path d="M12 21V3M5 10l7-7 7 7"/>',
  arrowLeft: '<path d="M21 12H3M10 5l-7 7 7 7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  refresh: '<path d="M21 3v6h-6M3 21v-6h6M4 9a8.5 8.5 0 0 1 14-5l3 5M3 15l3 5a8.5 8.5 0 0 0 14-5"/>',
  settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  pencil: '<path d="M4 16l-1 5 5-1L21 7l-4-4L4 16zM14 6l4 4"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  chart: '<path d="M3 20h18M5 16v-6h3v6M11 16V6h3v10M17 16V2h3v14"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 6v7M12 17h.01"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  piggy: '<path d="M5 9c-2 0-3 1-3 3v3h3l2 4h3v-2h5v2h3l2-5h2v-4h-3l-2-5-4 2a9 9 0 0 0-8 2zM9 6V3h5M8 9h6M17 11h.01"/>',
  cap: '<path d="M2 8l10-5 10 5-10 5L2 8zM6 10v7c4 3 8 3 12 0v-7M22 8v9"/>',
  dumbbell: '<path d="M6 4v16M3 8v8M18 4v16M21 8v8M6 12h12"/>',
  game: '<path d="M7 7h10c4 0 6 13 2 13l-4-4H9l-4 4C1 20 3 7 7 7zM8 10v5M5.5 12.5h5M16 11h.01M19 14h.01"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11V3z"/><circle cx="7" cy="7" r="1"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M7 12h.01M12 12h.01M17 12h.01"/>',
  empty: '<path d="M3 7l3-4h12l3 4v13H3V7zM3 8h5l2 4h4l2-4h5M8 16h8"/>',
  plane: '<path d="M22 2L9 15M22 2l-8 20-5-7-7-5 20-8z"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
};

/** Markup <svg> de un icono por nombre. */
function icono(nombre, cls) {
  return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[nombre] || ICON_PATHS.other}</svg>`;
}
/** Icono de una categoría. */
function iconoCategoria(nombre) { return icono(infoCategoria(nombre).svg); }

/** Reemplaza <span data-icon="nombre"> por su <svg> (para el HTML estático). */
function hidratarIconos(raiz) {
  (raiz || document).querySelectorAll('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterend', icono(el.dataset.icon, el.dataset.cls));
    el.remove();
  });
}

/** Escapa texto del usuario antes de ponerlo en innerHTML. */
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** ¿Es un gasto "fijo" (compromiso recurrente: suscripción, gym, internet...)? */
function esCategoriaFija(nombre) {
  return !!(CATEGORIA_CONFIG[nombre] && CATEGORIA_CONFIG[nombre].fijo);
}

/* ---------- Formato de moneda y números ---------- */

/** 1234.5 -> "S/ 1,234.50" */
function fmtMoneda(n, signo = false) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pref = signo ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  return `${pref}S/ ${signo ? Math.abs(v).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) : s}`;
}

/** "12000" o "12,000.5" -> 12000.5  (para inputs con separadores) */
function parseMonto(str) {
  if (typeof str === 'number') return str;
  const limpio = String(str).replace(/[^\d.]/g, '');
  return Number(limpio) || 0;
}

/** Formatea mientras se escribe en el input: 12000 -> "12,000" */
function fmtInputMientrasEscribe(str) {
  const limpio = String(str).replace(/[^\d.]/g, '');
  const partes = limpio.split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (partes[1] !== undefined) partes[1] = partes[1].slice(0, 2);
  return partes.length > 1 ? `${partes[0]}.${partes[1]}` : partes[0];
}

/* ---------- Fechas ---------- */

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/** Date -> "2026-06" */
function mesActualYYYYMM(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-06" -> "Junio 2026" */
function nombreMes(yyyymm) {
  const [y, m] = yyyymm.split('-');
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}

/** Date -> "2026-06-17" (para value de inputs date) */
function fechaISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Días que faltan para terminar el mes (incluye hoy). */
function diasRestantesMes(d = new Date()) {
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return ultimo - d.getDate() + 1;
}

/** Array de n meses "YYYY-MM" terminando en (e incluyendo) yyyymm, en orden cronológico. */
function mesesAnteriores(yyyymm, n) {
  const out = [];
  let [y, m] = yyyymm.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m--; if (m < 1) { m = 12; y--; }
  }
  return out;
}

/* ---------- Toast compartido (CSS puro, sin GSAP) ---------- */
function mostrarToast(mensaje, tipo = 'ok', ms = 3000) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  clearTimeout(el._t);
  el.className = `toast ${tipo}`;
  el.textContent = mensaje;
  void el.offsetWidth;                 // reinicia la transición
  el.classList.add('show');
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- Contador animado (rAF, sin GSAP) ----------
   Si la pestaña está oculta o el usuario pidió menos movimiento, pone el
   valor final de inmediato; además un respaldo garantiza que SIEMPRE
   termine en el número correcto aunque se pause el requestAnimationFrame. */
function animarNumero(el, valor, formato) {
  formato = formato || fmtMoneda;
  const desde = typeof el._v === 'number' ? el._v : 0;
  el._v = valor;
  cancelAnimationFrame(el._raf);
  clearTimeout(el._fin);
  if (document.hidden || desde === valor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = formato(valor);
    return;
  }
  const t0 = performance.now(), dur = 600;
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = formato(desde + (valor - desde) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) el._raf = requestAnimationFrame(paso);
  };
  el._raf = requestAnimationFrame(paso);
  el._fin = setTimeout(() => { el.textContent = formato(valor); }, dur + 120);
}

/** "2026-11-02" -> "02-nov" */
function fechaCorta(yyyymmdd) {
  const [, m, d] = String(yyyymmdd).split('-');
  return `${d}-${MESES_ES[Number(m) - 1].slice(0, 3).toLowerCase()}`;
}

/* ---------- Líneas de contorno decorativas (SVG generado, 0 KB extra) ---------- */
function contornos(cls) {
  let d = '';
  for (let i = 0; i < 12; i++) {
    d += `<path d="M -20 ${120 + i * 12} C 120 ${300 + i * 12} 240 ${300 + i * 12} 340 ${140 + i * 12} S 540 ${-20 + i * 12} 640 ${120 + i * 12}" stroke="currentColor" stroke-width="1"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 600 360" fill="none" aria-hidden="true">${d}</svg>`;
}
function hidratarContornos() {
  document.querySelectorAll('[data-contours]').forEach((el) => {
    el.insertAdjacentHTML('afterend', contornos(el.dataset.contours));
    el.remove();
  });
}

/* ---------- Movimiento de la aurora ----------
   Se pausa: con el botón del pie (se recuerda en este dispositivo), cuando
   la pestaña está oculta (no gasta batería en segundo plano) y con
   "reducir movimiento" del sistema (la textura se queda, quieta). */
const Movimiento = {
  KEY: 'fm_aurora_pausada',
  reducido: window.matchMedia('(prefers-reduced-motion: reduce)'),
  pausadoPorUsuario() { try { return localStorage.getItem(this.KEY) === '1'; } catch (e) { return false; } },
  sync() {
    const pausado = this.pausadoPorUsuario();
    document.body.classList.toggle('motion-paused', pausado || document.hidden);
    const b = document.getElementById('motionToggle');
    if (!b) return;
    b.disabled = this.reducido.matches;
    b.setAttribute('aria-pressed', String(pausado));
    b.textContent = this.reducido.matches ? 'Movimiento reducido' : pausado ? 'Reanudar aurora' : 'Pausar aurora';
  },
  init() {
    const b = document.getElementById('motionToggle');
    if (b) b.addEventListener('click', () => {
      try { localStorage.setItem(this.KEY, this.pausadoPorUsuario() ? '0' : '1'); } catch (e) { /* sin storage: no se recuerda */ }
      this.sync();
    });
    document.addEventListener('visibilitychange', () => this.sync());
    if (this.reducido.addEventListener) this.reducido.addEventListener('change', () => this.sync());
    this.sync();
  },
};

hidratarIconos();
hidratarContornos();
Movimiento.init();
