/* ============================================================
   FM_FINANCE — utils.js
   FUENTE ÚNICA DE VERDAD de categorías + helpers compartidos.
   (form.js, dashboard.js y charts.js leen de aquí — no dupliques.)
   ============================================================ */

const CATEGORIA_CONFIG = {
  // INGRESOS
  'Honorarios Cumbra':  { color: '#00FF88', icon: '▲', tipo: 'ingreso' },
  'Beca 18':            { color: '#00D4FF', icon: '▲', tipo: 'ingreso' },
  'Otros ingresos':     { color: '#7C6FF7', icon: '▲', tipo: 'ingreso' },
  // GASTOS
  'Suscripciones tech': { color: '#FF6B9D', icon: '▼', tipo: 'gasto' },
  'Transporte':         { color: '#FF6B9D', icon: '▼', tipo: 'gasto' },
  'Gym':                { color: '#FF6B9D', icon: '▼', tipo: 'gasto' },
  'Internet/Celular':   { color: '#FF6B9D', icon: '▼', tipo: 'gasto' },
  'Alimentación':       { color: '#FFB800', icon: '▼', tipo: 'gasto' },
  'Universidad':        { color: '#FFB800', icon: '▼', tipo: 'gasto' },
  'Gaming/Ocio':        { color: '#FFB800', icon: '▼', tipo: 'gasto' },
  'Ropa/Personal':      { color: '#FFB800', icon: '▼', tipo: 'gasto' },
  'Emergencias':        { color: '#FF4444', icon: '▼', tipo: 'gasto' },
  'Otro':               { color: '#8888AA', icon: '▼', tipo: 'gasto' },
};

/** Lista de nombres de categoría filtrada por tipo ('ingreso' | 'gasto'). */
function categoriasPorTipo(tipo) {
  return Object.keys(CATEGORIA_CONFIG).filter(k => CATEGORIA_CONFIG[k].tipo === tipo);
}

/** Info de una categoría (color/icon/tipo), con fallback seguro. */
function infoCategoria(nombre) {
  return CATEGORIA_CONFIG[nombre] || { color: '#8888AA', icon: '•', tipo: 'gasto' };
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

/* ---------- Toast compartido ---------- */
function mostrarToast(mensaje, tipo = 'ok', ms = 3000) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = mensaje;
  el.className = `toast ${tipo}`;
  if (window.gsap) {
    gsap.killTweensOf(el);
    gsap.fromTo(el, { y: '-120%', opacity: 0 }, { y: '0%', opacity: 1, duration: .35, ease: 'power3.out' });
    gsap.to(el, { y: '-120%', opacity: 0, duration: .35, ease: 'power3.in', delay: ms / 1000 });
  } else {
    el.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { el.style.transform = 'translateX(-50%) translateY(-120%)'; }, ms);
  }
}
