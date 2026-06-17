/* ============================================================
   FM_FINANCE — sheets.js
   Capa de comunicación con el backend (Apps Script).
   + Cola offline en localStorage (se vacía al volver internet).
   ============================================================ */

const Sheets = {
  async _get(params) {
    const { url, token } = Conexion.get();
    if (!url || !token) throw new Error('Sin configurar');
    const qs = new URLSearchParams(Object.assign({}, params, { token })).toString();
    const res = await fetch(`${url}?${qs}`, { method: 'GET' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error de lectura');
    return data.data;
  },

  async _post(payload) {
    const { url, token } = Conexion.get();
    if (!url || !token) throw new Error('Sin configurar');
    const res = await fetch(url, {
      method: 'POST',
      // text/plain evita el preflight CORS que Apps Script no soporta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({}, payload, { token })),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al guardar');
    return data;
  },

  leer(mes)  { return this._get(mes ? { action: 'read', mes } : { action: 'read' }); },
  resumen()  { return this._get({ action: 'summary' }); },
  crear(tx)  { return this._post(Object.assign({ accion: 'crear' }, tx)); },
  borrar(id) { return this._post({ accion: 'borrar', id }); },

  // Metas de ahorro (sincronizadas entre dispositivos).
  // leerMetas devuelve el array, o null si nunca se han guardado en el backend.
  leerMetas()       { return this._get({ action: 'metas' }); },
  guardarMetas(arr) { return this._post({ accion: 'guardarMetas', metas: arr }); },

  /** Prueba la conexión (URL+token) leyendo. Lanza error si falla. */
  async probar() { await this.leer(); return true; },
};

/* ---------- Cola offline ---------- */
const Cola = {
  KEY: 'fm_cola',

  obtener()      { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  _guardar(arr)  { localStorage.setItem(this.KEY, JSON.stringify(arr)); },
  count()        { return this.obtener().length; },
  agregar(tx)    { const c = this.obtener(); c.push(tx); this._guardar(c); },

  /** Intenta enviar todo lo pendiente. Devuelve cuántas se enviaron. */
  async vaciar() {
    const pendientes = this.obtener();
    if (!pendientes.length) return 0;
    const restantes = [];
    for (const tx of pendientes) {
      try { await Sheets.crear(tx); }
      catch { restantes.push(tx); }
    }
    this._guardar(restantes);
    return pendientes.length - restantes.length;
  },
};
