/* ============================================================
   FM_FINANCE — config.js
   Configuración de la app. SIN secretos quemados aquí:
   la URL del Apps Script y el token se guardan en el navegador
   (pantalla Configuración) → este archivo es seguro en repo público
   y reutilizable por cualquiera (tú, tu hermana...) con la misma URL.
   ============================================================ */

const CONFIG = {
  MONEDA: 'S/',
  TX_POR_PAGINA: 10,
  MESES_HISTORIAL: 6,

  // Límites mensuales por categoría de gasto (S/). Alerta si se supera.
  PRESUPUESTO: {
    'Alimentación':       400,
    'Transporte':         150,
    'Suscripciones tech': 100,
    'Gym':                 80,
    'Gaming/Ocio':        100,
    'Universidad':         80,
    'Ropa/Personal':      100,
  },

  // Metas de ahorro (el "actual" se calcula/ajusta en el dashboard).
  METAS: [
    { nombre: 'Laptop Legion Pro', objetivo: 3500, actual: 0 },
    { nombre: 'Fondo emergencia',  objetivo: 1000, actual: 0 },
  ],
};

/* ------------------------------------------------------------
   Conexión al backend — vive en localStorage, no en el código.
   ------------------------------------------------------------ */
const Conexion = {
  KEY_URL: 'fm_apps_script_url',
  KEY_TOKEN: 'fm_token',

  get() {
    return {
      url:   localStorage.getItem(this.KEY_URL)   || '',
      token: localStorage.getItem(this.KEY_TOKEN) || '',
    };
  },

  set(url, token) {
    localStorage.setItem(this.KEY_URL, (url || '').trim());
    localStorage.setItem(this.KEY_TOKEN, (token || '').trim());
  },

  configurada() {
    const c = this.get();
    return Boolean(c.url && c.token);
  },

  borrar() {
    localStorage.removeItem(this.KEY_URL);
    localStorage.removeItem(this.KEY_TOKEN);
  },
};

/* ------------------------------------------------------------
   Metas de ahorro editables — viven en localStorage (este
   dispositivo). CONFIG.METAS es solo la semilla por defecto.
   ------------------------------------------------------------ */
const Metas = {
  KEY: 'fm_metas',

  get() {
    try {
      const r = localStorage.getItem(this.KEY);
      if (r) return JSON.parse(r);
    } catch (e) { /* corrupto → usa semilla */ }
    return CONFIG.METAS.map(m => ({ ...m }));
  },

  set(arr) {
    localStorage.setItem(this.KEY, JSON.stringify(arr || []));
  },
};
