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
//    ?action=read&token=XXX            -> ultimas 200 (o de un mes con &mes=2026-06)
//    ?action=summary&token=XXX         -> totales de los ultimos 6 meses
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.token !== TOKEN) return json({ ok: false, error: 'Token invalido' });

    const sheet = getSheet();
    const action = p.action || 'read';

    if (action === 'summary') return json({ ok: true, data: resumen6Meses(sheet) });

    // action === 'read'
    return json({ ok: true, data: leerTransacciones(sheet, p.mes) });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers de datos
// ─────────────────────────────────────────────────────────────
function leerTransacciones(sheet, mes) {
  const rows = sheet.getDataRange().getValues();
  rows.shift(); // quita encabezados
  let txs = rows.map(filaAObjeto).filter(t => t.id); // descarta filas vacias
  if (mes) txs = txs.filter(t => t.mes === mes);
  txs.reverse(); // mas recientes primero
  return mes ? txs : txs.slice(0, 200);
}

function resumen6Meses(sheet) {
  const rows = sheet.getDataRange().getValues();
  rows.shift();
  const acc = {}; // { '2026-06': {ingreso: x, gasto: y} }
  rows.forEach(r => {
    const t = filaAObjeto(r);
    if (!t.id) return;
    if (!acc[t.mes]) acc[t.mes] = { ingreso: 0, gasto: 0 };
    if (t.tipo === 'ingreso') acc[t.mes].ingreso += t.monto;
    else acc[t.mes].gasto += t.monto;
  });
  const meses = Object.keys(acc).sort().slice(-6);
  return meses.map(m => ({ mes: m, ingreso: acc[m].ingreso, gasto: acc[m].gasto }));
}

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
