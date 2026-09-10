/* ============================================================
   FM_FINANCE — sheets.js
   Capa de comunicación con el backend (Apps Script).
   + Cola offline en localStorage (se vacía al volver internet).
   ============================================================ */

const Sheets = {
  // Apps Script a veces rechaza invocaciones (varias llamadas simultáneas,
  // cold start) y devuelve una página HTML de error en vez de JSON —
  // res.json() truena con "Unexpected token '<'". Reintenta UNA vez tras
  // una pausa antes de rendirse; no reintenta errores de negocio (ok:false).
  async _fetchJson(doFetch) {
    try {
      return await (await doFetch()).json();
    } catch (e) {
      await new Promise((r) => setTimeout(r, 900));
      return await (await doFetch()).json();
    }
  },

  async _get(params) {
    const { url, token } = Conexion.get();
    if (!url || !token) throw new Error('Sin configurar');
    const qs = new URLSearchParams(Object.assign({}, params, { token })).toString();
    const data = await this._fetchJson(() => fetch(`${url}?${qs}`, { method: 'GET' }));
    if (!data.ok) throw new Error(data.error || 'Error de lectura');
    return data.data;
  },

  async _post(payload) {
    const { url, token } = Conexion.get();
    if (!url || !token) throw new Error('Sin configurar');
    const body = JSON.stringify(Object.assign({}, payload, { token }));
    const data = await this._fetchJson(() => fetch(url, {
      method: 'POST',
      // text/plain evita el preflight CORS que Apps Script no soporta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    }));
    if (!data.ok) throw new Error(data.error || 'Error al guardar');
    return data;
  },

  leer(mes)  { return this._get(mes ? { action: 'read', mes } : { action: 'read' }); },
  resumen()  { return this._get({ action: 'summary' }); },
  balance()  { return this._get({ action: 'balance' }); }, // { saldo }: acumulado de TODO el historial
  crear(tx)  { return this._post(Object.assign({ accion: 'crear' }, tx)); },
  borrar(id) { return this._post({ accion: 'borrar', id }); },

  // Todo lo que necesita el dashboard en UNA sola llamada/lectura de hoja
  // (evita disparar 5 invocaciones simultáneas al backend).
  // -> { tx, resumen, metas, saldo, txsRecientes }
  dashboard(mes, mesesRecientes) {
    const params = { action: 'dashboard' };
    if (mes) params.mes = mes;
    if (mesesRecientes) params.mesesRecientes = mesesRecientes;
    return this._get(params);
  },

  // Metas de ahorro (sincronizadas entre dispositivos).
  // leerMetas devuelve el array, o null si nunca se han guardado en el backend.
  leerMetas()       { return this._get({ action: 'metas' }); },
  guardarMetas(arr) { return this._post({ accion: 'guardarMetas', metas: arr }); },

  /** Prueba la conexión (URL+token) leyendo. Lanza error si falla. */
  async probar() { await this.leer(); return true; },
};

/* ---------- Caché local del dashboard por mes (stale-while-revalidate) ----------
   Apps Script (cuenta gratuita) puede tardar 3-18s en responder — variable,
   no lo controlamos. Se guarda el último resultado conocido de cada mes para
   mostrarlo instantáneo mientras se refresca en segundo plano. Compartido
   entre dashboard.js (lo lee/usa) y form.js (lo precarga en background). */
const CacheDash = {
  _key(mes) { return 'fm_cache_dash_' + mes; },
  get(mes) { try { return JSON.parse(localStorage.getItem(this._key(mes))); } catch (e) { return null; } },
  set(mes, d) { try { localStorage.setItem(this._key(mes), JSON.stringify(d)); } catch (e) { /* localStorage lleno: ignorar */ } },

  /** Refresca el caché de un mes en segundo plano, sin bloquear ni avisar si falla. */
  async precargar(mes, mesesRecientes) {
    try { this.set(mes, await Sheets.dashboard(mes, mesesRecientes)); }
    catch (e) { /* silencioso: es solo una precarga oportunista */ }
  },
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
