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

// ─────────────────────────────────────────────────────────────
// 2) ESCRITURA — la app envía un POST (text/plain con JSON dentro)
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return json({ ok: false, error: 'Token invalido' });

    const sheet = getSheet();
    const accion = data.accion || 'crear';

    if (accion === 'borrar') {
      return json(borrarPorId(sheet, data.id));
    }

    if (accion === 'guardarMetas') {
      PropertiesService.getScriptProperties().setProperty('METAS_JSON', JSON.stringify(data.metas || []));
      return json({ ok: true });
    }

    // accion === 'crear'
    const now = new Date();
    const fecha = data.fecha ? new Date(data.fecha) : now;
    const id = Utilities.getUuid();
    const mes = Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM');

    sheet.appendRow([
      id,
      now,
      Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      data.tipo || '',
      data.categoria || '',
      data.subcategoria || '',
      Number(data.monto) || 0,
      data.descripcion || '',
      data.fuente || 'form',
      mes
    ]);

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

    const sheet = getSheet();
    const action = p.action || 'read';

    if (action === 'dashboard') return json({ ok: true, data: datosDashboard(sheet, p.mes, p.mesesRecientes) });

    if (action === 'summary') return json({ ok: true, data: resumen6MesesDesde(todasLasTransacciones(sheet)) });

    if (action === 'metas') return json({ ok: true, data: leerMetasGuardadas() });

    if (action === 'balance') return json({ ok: true, data: { saldo: saldoTotalDesde(todasLasTransacciones(sheet)) } });

    // action === 'read'
    return json({ ok: true, data: leerTransacciones(sheet, p.mes) });
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

// Lee TODA la hoja una vez y la convierte a objetos (sin ordenar/filtrar).
function todasLasTransacciones(sheet) {
  const rows = sheet.getDataRange().getValues();
  rows.shift(); // quita encabezados
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
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { ok: true, borrado: id };
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
  if (esFecha(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), fmt);
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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
