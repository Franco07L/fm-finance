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
  // Corta a los 12s: una petición colgada bloqueaba la UI hasta 40s.
  // Además el reintento suele ser rapidísimo, porque el primer intento ya
  // dejó la respuesta en la caché del servidor.
  TIMEOUT_MS: 12000,

  async _unaVez(doFetch) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.TIMEOUT_MS);
    try {
      return await (await doFetch(ac.signal)).json();
    } finally {
      clearTimeout(t);
    }
  },

  async _fetchJson(doFetch) {
    try {
      return await this._unaVez(doFetch);
    } catch (e) {
      await new Promise((r) => setTimeout(r, 600));
      return await this._unaVez(doFetch);
    }
  },

  async _get(params) {
    const { url, token } = Conexion.get();
    if (!url || !token) throw new Error('Sin configurar');
    const qs = new URLSearchParams(Object.assign({}, params, { token })).toString();
    const data = await this._fetchJson((signal) => fetch(`${url}?${qs}`, { method: 'GET', signal }));
    if (!data.ok) throw new Error(data.error || 'Error de lectura');
    return data.data;
  },

  async _post(payload) {
    const { url, token } = Conexion.get();
    if (!url || !token) throw new Error('Sin configurar');
    const body = JSON.stringify(Object.assign({}, payload, { token }));
    const data = await this._fetchJson((signal) => fetch(url, {
      method: 'POST',
      // text/plain evita el preflight CORS que Apps Script no soporta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      signal,
    }));
    if (!data.ok) throw new Error(data.error || 'Error al guardar');
    return data;
  },

  leer(mes)  { return this._get(mes ? { action: 'read', mes } : { action: 'read' }); },
  resumen()  { return this._get({ action: 'summary' }); },
  balance()  { return this._get({ action: 'balance' }); }, // { saldo }: acumulado de TODO el historial
  crear(tx)  { return this._post(Object.assign({ accion: 'crear' }, tx)); },
  // mesesRecientes es opcional: si se manda, el backend precalienta la
  // caché del dashboard con esa ventana exacta tras borrar (ver Code.gs
  // warmCache_). Sin ella igual funciona, solo que sin ese atajo.
  borrar(id, mesesRecientes) { return this._post({ accion: 'borrar', id, mesesRecientes }); },

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

  /** Prueba la conexión (URL+token). Usa 'ping': valida el token sin abrir
   *  el Sheet, así que responde al instante en vez de tardar lo mismo que
   *  una lectura completa. */
  async probar() { await this._get({ action: 'ping' }); return true; },
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
