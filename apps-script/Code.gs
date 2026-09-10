/*
 * FM_FINANCE — Backend (Google Apps Script)
 * Hace de API entre la app (GitHub Pages) y tu Google Sheet privado.
 * El Sheet NUNCA se publica: este script corre "como tú" y es el único que lo toca.
 *
 * Seguridad: toda petición (POST y GET) debe traer el token correcto.
 * CORS: se evita el preflight recibiendo POST como text/plain (ver doPost).
 */

// ─────────────────────────────────────────────────────────────
// 1) CONFIGURACIÓN — el token NO va escrito aquí
// ─────────────────────────────────────────────────────────────
// Este archivo se sube a un repo PÚBLICO, así que el token vive en
// las "Propiedades del script" (un cofre privado del proyecto):
//   Configuración del proyecto (⚙ engranaje, barra izquierda)
//     → Propiedades del script → Agregar
//       Propiedad: TOKEN   |   Valor: tu token (el mismo de la app)
const TOKEN = PropertiesService.getScriptProperties().getProperty('TOKEN');

const SHEET_NAME = 'Transacciones';
const HEADERS = ['ID', 'Timestamp', 'Fecha', 'Tipo', 'Categoria',
                 'Subcategoria', 'Monto', 'Descripcion', 'Fuente', 'Mes'];

// Zona horaria FIJA. No dependemos de la del proyecto (si queda en otra,
// una fecha "hoy" puede caer en el mes anterior al formatear).
const TZ = 'America/Lima';

// ─────────────────────────────────────────────────────────────
// 1.b) CACHÉ DE SERVIDOR — lo que de verdad arregla la lentitud
// ─────────────────────────────────────────────────────────────
// Medido: abrir el Spreadsheet y leerlo tarda entre 3 y 40 segundos en
// cuentas gratuitas (es lo caro, no el cálculo). CacheService vive en la
// infraestructura de Apps Script y responde en milisegundos.
//
// Estrategia: la respuesta YA SERIALIZADA del dashboard se guarda en caché.
// Mientras nadie escriba, las lecturas ni siquiera tocan el Sheet.
// Cualquier escritura (crear/borrar/metas) sube DATA_VER, lo que invalida
// todas las claves de golpe (van versionadas en el nombre).
const CACHE_TTL = 21600;           // 6 h (máximo que permite Apps Script)
const CACHE_MAX = 95000;           // límite real por entrada: 100 KB
const VER_KEY   = 'DATA_VER';

function cache_() { return CacheService.getScriptCache(); }

function dataVersion_() {
  const c = cache_();
  let v = c.get(VER_KEY);
  if (!v) { v = String(Date.now()); c.put(VER_KEY, v, CACHE_TTL); }
  return v;
}

// Se llama tras CADA escritura: la versión cambia, las claves viejas
// quedan huérfanas y la siguiente lectura relee el Sheet una sola vez.
function invalidarCache_() {
  cache_().put(VER_KEY, String(Date.now()), CACHE_TTL);
}

// ─────────────────────────────────────────────────────────────
// 2) ESCRITURA — la app envía un POST (text/plain con JSON dentro)
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return json({ ok: false, error: 'Token invalido' });

    const accion = data.accion || 'crear';

    if (accion === 'guardarMetas') {
      // OJO: guardar metas NO invalida el caché del dashboard (que sí exige
      // reabrir el Sheet). Las metas viven aparte en Propiedades del script
      // (barato) y dashboardCacheado_() las sirve SIEMPRE frescas, así que
      // no hace falta pagar el costo completo del Sheet solo por esto.
      PropertiesService.getScriptProperties().setProperty('METAS_JSON', JSON.stringify(data.metas || []));
      return json({ ok: true });
    }

    const sheet = getSheet();

    if (accion === 'borrar') {
      const r = borrarPorId(sheet, data.id); // ya incluye r.mes de la fila borrada
      invalidarCache_();
      if (r.ok) warmCache_(sheet, r.mes, data.mesesRecientes);
      return json(r);
    }

    // accion === 'crear'
    const now = new Date();
    const fecha = data.fecha ? new Date(data.fecha) : now;
    const id = Utilities.getUuid();
    const mes = Utilities.formatDate(fecha, TZ, 'yyyy-MM');

    sheet.appendRow([
      id,
      now,
      Utilities.formatDate(fecha, TZ, 'yyyy-MM-dd'),
      data.tipo || '',
      data.categoria || '',
      data.subcategoria || '',
      Number(data.monto) || 0,
      data.descripcion || '',
      data.fuente || 'form',
      mes
    ]);

    invalidarCache_();
    // CLAVE para la lentitud ">15s tras registrar": sin esto, la escritura
    // pagaba el costo de abrir el Sheet, y la SIGUIENTE lectura (el usuario
    // volviendo al dashboard) pagaba ESE MISMO costo otra vez porque la
    // acabábamos de invalidar. Aprovechamos que el Sheet ya está abierto
    // aquí mismo para recalentar de una vez las claves de caché más
    // probables — así esa siguiente lectura sale de caché, instantánea.
    warmCache_(sheet, mes, data.mesesRecientes);
    return json({ ok: true, id: id });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────────────────────
// 3) LECTURA — la app pide datos con un GET
//    ?action=dashboard&token=XXX&mes=2026-09&mesesRecientes=2026-07,2026-08,2026-09
//         -> TODO lo que necesita el dashboard en UNA sola llamada/lectura de hoja
//            (recomendado: evita disparar varias invocaciones simultaneas, que
//            Apps Script a veces rechaza devolviendo una pagina HTML en vez de JSON)
//    ?action=read&token=XXX            -> ultimas 200
//    ?action=read&token=XXX&mes=2026-06            -> un mes
//    ?action=read&token=XXX&mes=2026-07,2026-08,2026-09  -> varios meses (CSV), sin tope de 200
//    ?action=summary&token=XXX         -> totales de los ultimos 6 meses
//    ?action=balance&token=XXX         -> saldo acumulado de TODO el historial
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.token !== TOKEN) return json({ ok: false, error: 'Token invalido' });

    const action = p.action || 'read';

    // Prueba de conexión: NO toca el Sheet (antes tardaba lo mismo que
    // una lectura completa; ahora responde al instante).
    if (action === 'ping') return json({ ok: true, data: { pong: true } });

    // OJO: getSheet() es LO CARO. No se llama hasta que de verdad haga falta,
    // y las rutas cacheadas de abajo lo saltan por completo.

    if (action === 'dashboard') return dashboardCacheado_(p.mes, p.mesesRecientes);

    if (action === 'summary') {
      return jsonCacheado_('sum', () => ({ ok: true, data: resumen6MesesDesde(todasLasTransacciones(getSheet())) }));
    }

    if (action === 'metas') return json({ ok: true, data: leerMetasGuardadas() });

    if (action === 'balance') {
      return jsonCacheado_('bal', () => ({ ok: true, data: { saldo: saldoTotalDesde(todasLasTransacciones(getSheet())) } }));
    }

    // action === 'read'
    return jsonCacheado_('read|' + (p.mes || ''), () => ({ ok: true, data: leerTransacciones(getSheet(), p.mes) }));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers de datos
// ─────────────────────────────────────────────────────────────

// Lee la hoja UNA sola vez y arma todo lo que pide el dashboard: transacciones
// del mes, resumen de 6 meses, metas, saldo total y transacciones recientes
// (para detectar gastos recurrentes). Evita 5 llamadas HTTP separadas.
function datosDashboard(sheet, mes, mesesRecientes) {
  const todas = todasLasTransacciones(sheet);
  const mesesRec = mesesRecientes ? String(mesesRecientes).split(',') : [];
  return {
    tx: filtrarPorMeses(todas, mes ? [mes] : null),
    resumen: resumen6MesesDesde(todas),
    metas: leerMetasGuardadas(),
    saldo: saldoTotalDesde(todas),
    txsRecientes: mesesRec.length ? filtrarPorMeses(todas, mesesRec) : [],
  };
}

// Lee las filas con datos y las convierte a objetos (sin ordenar/filtrar).
// Rango ACOTADO a propósito: getDataRange() devuelve todo el "rango usado",
// que tras borrar filas puede quedar inflado con miles de celdas vacías y
// hace que cada lectura mueva mucho más de lo necesario.
function todasLasTransacciones(sheet) {
  const ultima = sheet.getLastRow();
  if (ultima < 2) return [];
  const rows = sheet.getRange(2, 1, ultima - 1, HEADERS.length).getValues();
  return rows.map(filaAObjeto).filter(t => t.id); // descarta filas vacias
}

function filtrarPorMeses(todas, meses) {
  let txs = meses ? todas.filter(t => meses.indexOf(t.mes) !== -1) : todas.slice();
  txs.reverse(); // mas recientes primero
  return meses ? txs : txs.slice(0, 200);
}

function leerTransacciones(sheet, mes) {
  const meses = mes ? String(mes).split(',') : null; // soporta "2026-06" o CSV de varios
  return filtrarPorMeses(todasLasTransacciones(sheet), meses);
}

// Suma TODO el historial (ingresos - gastos). Barato: Apps Script procesa
// miles de filas de sobra dentro del timeout.
function saldoTotalDesde(todas) {
  return todas.reduce((saldo, t) => saldo + (t.tipo === 'ingreso' ? t.monto : -t.monto), 0);
}
function saldoTotal(sheet) { return saldoTotalDesde(todasLasTransacciones(sheet)); }

function resumen6MesesDesde(todas) {
  const acc = {}; // { '2026-06': {ingreso: x, gasto: y} }
  todas.forEach(t => {
    if (!acc[t.mes]) acc[t.mes] = { ingreso: 0, gasto: 0 };
    if (t.tipo === 'ingreso') acc[t.mes].ingreso += t.monto;
    else acc[t.mes].gasto += t.monto;
  });
  const meses = Object.keys(acc).sort().slice(-6);
  return meses.map(m => ({ mes: m, ingreso: acc[m].ingreso, gasto: acc[m].gasto }));
}
function resumen6Meses(sheet) { return resumen6MesesDesde(todasLasTransacciones(sheet)); }

function borrarPorId(sheet, id) {
  const ultima = sheet.getLastRow();
  if (ultima < 2) return { ok: false, error: 'ID no encontrado' };
  // Columnas ID (A) y Mes (J): lo mínimo para encontrar la fila y saber
  // qué mes recalentar en warmCache_() sin releer toda la hoja.
  const datos = sheet.getRange(2, 1, ultima - 1, HEADERS.length).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][0] === id) {
      sheet.deleteRow(i + 2);
      return { ok: true, borrado: id, mes: fmtCampoFecha(datos[i][2], 'yyyy-MM') };
    }
  }
  return { ok: false, error: 'ID no encontrado' };
}

// Metas de ahorro: guardadas como JSON en Propiedades del script.
// Devuelve null si NUNCA se han guardado (para distinguir de "lista vacía").
function leerMetasGuardadas() {
  const raw = PropertiesService.getScriptProperties().getProperty('METAS_JSON');
  return raw ? JSON.parse(raw) : null;
}

// Detección de Date robusta (instanceof falla con valores de Sheets en Apps Script).
function esFecha(v) {
  return v && Object.prototype.toString.call(v) === '[object Date]';
}

// Formatea sea Date (lo que devuelve Sheets) o texto.
function fmtCampoFecha(v, fmt) {
  if (esFecha(v)) return Utilities.formatDate(v, TZ, fmt);
  return (v === '' || v == null) ? '' : String(v);
}

function filaAObjeto(r) {
  return {
    id: r[0],
    timestamp: esFecha(r[1]) ? r[1].toISOString() : String(r[1] || ''),
    fecha: fmtCampoFecha(r[2], 'yyyy-MM-dd'),
    tipo: r[3],
    categoria: r[4],
    subcategoria: r[5],
    monto: Number(r[6]) || 0,
    descripcion: r[7],
    fuente: r[8],
    mes: fmtCampoFecha(r[2], 'yyyy-MM')  // derivado de la fecha → siempre "YYYY-MM"
  };
}

// ─────────────────────────────────────────────────────────────
// Infraestructura
// ─────────────────────────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Ejecuta esto UNA VEZ desde el editor (boton Run) para crear la pestaña y encabezados.
function setupSheet() {
  getSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('Sheet "Transacciones" listo.');
}

function json(obj) {
  return texto_(JSON.stringify(obj));
}

function texto_(str) {
  return ContentService
    .createTextOutput(str)
    .setMimeType(ContentService.MimeType.JSON);
}

// Devuelve la respuesta desde caché si existe; si no, ejecuta calcular()
// (que SÍ abre el Sheet), guarda el JSON ya serializado y lo devuelve.
// La clave lleva la versión de datos incrustada: al escribir, la versión
// cambia y todas las entradas anteriores dejan de encontrarse.
function jsonCacheado_(clave, calcular) {
  const c = cache_();
  const k = 'v' + dataVersion_() + '|' + clave;
  const hit = c.get(k);
  if (hit) return texto_(hit);

  const body = JSON.stringify(calcular());
  if (body.length < CACHE_MAX) c.put(k, body, CACHE_TTL);
  return texto_(body);
}

// Como jsonCacheado_, pero para 'dashboard': las metas SIEMPRE se sirven
// frescas (releídas de Propiedades, barato) encima del payload cacheado,
// para no depender de invalidar el caché pesado del Sheet solo por editar
// una meta de ahorro.
function dashboardCacheado_(mes, mesesRecientes) {
  const c = cache_();
  const k = 'v' + dataVersion_() + '|dash|' + (mes || '') + '|' + (mesesRecientes || '');
  const metasFrescas = leerMetasGuardadas();

  const hit = c.get(k);
  if (hit) {
    const obj = JSON.parse(hit);
    obj.data.metas = metasFrescas;
    return texto_(JSON.stringify(obj));
  }

  const obj = { ok: true, data: datosDashboard(getSheet(), mes, mesesRecientes) };
  obj.data.metas = metasFrescas; // ya venía de leerMetasGuardadas() adentro, pero por claridad/consistencia
  const body = JSON.stringify(obj);
  if (body.length < CACHE_MAX) c.put(k, body, CACHE_TTL);
  return texto_(body);
}

// Opcional: ejecútalo desde el editor si alguna vez quieres forzar
// que la próxima lectura vuelva a mirar el Sheet.
function limpiarCache() {
  invalidarCache_();
  SpreadsheetApp.getActiveSpreadsheet().toast('Caché invalidada.');
}

// Réplica server-side de mesesAnteriores() en utils.js (cliente): los n
// meses ANTERIORES a yyyymm, más viejo primero. Se usa para que la clave
// de caché que precalentamos coincida con la que el dashboard pedirá.
function mesesAnterioresCSV_(yyyymm, n) {
  const out = [];
  let [y, m] = String(yyyymm).split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.unshift(y + '-' + String(m).padStart(2, '0'));
    m--; if (m < 1) { m = 12; y--; }
  }
  return out.join(',');
}

// Guarda directamente un objeto ya calculado bajo la versión ACTUAL de
// caché (llamar SOLO después de invalidarCache_(), para que quede bajo
// la versión nueva y no una que ya está huérfana).
function guardarEnCache_(clave, obj) {
  const body = JSON.stringify(obj);
  if (body.length < CACHE_MAX) cache_().put('v' + dataVersion_() + '|' + clave, body, CACHE_TTL);
}

// Se llama justo después de escribir (crear/borrar), con el Sheet ya
// abierto: en vez de dejar que la PRÓXIMA lectura pague de nuevo el costo
// de abrir/leer el Sheet (que acabamos de invalidar), la calculamos y
// cacheamos aquí mismo. Cubre las claves que de verdad se piden:
// el dashboard del mes afectado (con la MISMA ventana de "recientes" que
// pide el cliente, si la mandó), balance, resumen y read del mes.
function warmCache_(sheet, mes, mesesRecientesCSV) {
  try {
    const todas = todasLasTransacciones(sheet);
    const ventana = mesesRecientesCSV || mesesAnterioresCSV_(mes, 3);

    guardarEnCache_('dash|' + mes + '|' + ventana, { ok: true, data: {
      tx: filtrarPorMeses(todas, [mes]),
      resumen: resumen6MesesDesde(todas),
      metas: leerMetasGuardadas(),
      saldo: saldoTotalDesde(todas),
      txsRecientes: filtrarPorMeses(todas, String(ventana).split(',')),
    }});
    // Variante sin ventana (por si el cliente la pide vacía).
    guardarEnCache_('dash|' + mes + '|', { ok: true, data: {
      tx: filtrarPorMeses(todas, [mes]),
      resumen: resumen6MesesDesde(todas),
      metas: leerMetasGuardadas(),
      saldo: saldoTotalDesde(todas),
      txsRecientes: [],
    }});
    guardarEnCache_('bal', { ok: true, data: { saldo: saldoTotalDesde(todas) } });
    guardarEnCache_('sum', { ok: true, data: resumen6MesesDesde(todas) });
    guardarEnCache_('read|' + mes, { ok: true, data: filtrarPorMeses(todas, [mes]) });
  } catch (e) {
    // Nunca dejar que un fallo al precalentar tumbe la escritura misma.
  }
}

/* ════════════════════════════════════════════════════════════
 * SETUP — pasos para dejar el backend funcionando (hazlo 1 vez)
 * ════════════════════════════════════════════════════════════
 * 1. Entra a https://sheets.google.com con TU cuenta y crea un Sheet
 *    nuevo. Ponle de nombre: FM_Finance_DB
 *
 * 2. En ese Sheet: menú Extensiones → Apps Script.
 *    Borra el codigo de ejemplo y pega TODO este archivo (Code.gs).
 *
 * 3. Guarda tu token en las Propiedades del script (NO en el codigo):
 *      Configuracion del proyecto (engranaje, barra izquierda)
 *      -> Propiedades del script -> Agregar propiedad
 *         Propiedad: TOKEN   Valor: tu token aleatorio
 *      -> Guardar propiedades del script.
 *    GUARDA TAMBIEN ese token aparte, lo necesitaras en la app.
 *
 * 4. Arriba selecciona la funcion "setupSheet" y pulsa Run (▶).
 *    La primera vez Google pedira permisos → Revisar permisos →
 *    elige tu cuenta → "Avanzado" → "Ir a (no seguro)" → Permitir.
 *    (Es seguro: es TU propio script sobre TU propio Sheet.)
 *
 * 5. Boton azul "Implementar" (Deploy) → Nueva implementacion →
 *    tipo "Aplicacion web":
 *       - Ejecutar como:        Yo (tu correo)
 *       - Quien tiene acceso:   Cualquier persona
 *    → Implementar → copia la "URL de la aplicacion web".
 *
 * 6. Esa URL + el token van en la app (pantalla Configuracion).
 *    El Sheet QUEDA PRIVADO: no lo publiques, no lo compartas.
 *
 * NOTA: cada vez que cambies este codigo, debes volver a Implementar
 * → "Administrar implementaciones" → editar (lapiz) → Nueva version.
 * ════════════════════════════════════════════════════════════ */
