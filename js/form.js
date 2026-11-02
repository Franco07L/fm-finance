/* ============================================================
   FM_FINANCE — form.js
   Lógica del registro de transacciones (mobile-first).
   ============================================================ */

(function () {
  'use strict';

  // --- Estado ---
  let tipoActual = 'gasto';

  // --- Refs ---
  const $ = (s) => document.querySelector(s);
  const formTx      = $('#formTx');
  const btnGasto    = $('#btnGasto');
  const btnIngreso  = $('#btnIngreso');
  const toggleBox   = $('#typeToggle');
  const catWrap     = $('#catWrap');
  const otraWrap    = $('#otraWrap');
  const fechaWrap   = $('#fechaWrap');
  const btnRegTxt   = $('#btnRegistrarTxt');
  const selCategoria = $('#selCategoria');
  const inpOtraCategoria = $('#inpOtraCategoria');
  const inpMonto    = $('#inpMonto');
  const montoBox    = $('#montoBox');
  const inpDescripcion = $('#inpDescripcion');
  const inpFecha    = $('#inpFecha');
  const btnRegistrar = $('#btnRegistrar');
  const colaBadge   = $('#colaBadge');
  const colaCount   = $('#colaCount');

  // Config overlay
  const cfgOverlay  = $('#cfgOverlay');
  const cfgUrl      = $('#cfgUrl');
  const cfgToken    = $('#cfgToken');
  const cfgEstado   = $('#cfgEstado');
  const btnGuardarCfg = $('#btnGuardarCfg');
  const btnConfig   = $('#btnConfig');

  // ------------------------------------------------------------
  // Categorías según tipo
  // ------------------------------------------------------------
  function poblarCategorias() {
    const cats = categoriasPorTipo(tipoActual);
    selCategoria.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    toggleOtro();
    actualizarIconoCategoria();
  }

  // Icono + color de la categoría elegida (junto al desplegable)
  function actualizarIconoCategoria() {
    const info = infoCategoria(selCategoria.value);
    catWrap.style.setProperty('--c', info.color);
    const svg = catWrap.querySelector('svg');
    if (svg) svg.outerHTML = iconoCategoria(selCategoria.value);
  }

  // Muestra un campo para escribir la categoría cuando se elige "Otro".
  function toggleOtro() {
    const esOtro = selCategoria.value === 'Otro';
    otraWrap.hidden = !esOtro;
    if (!esOtro) inpOtraCategoria.value = '';
  }
  selCategoria.addEventListener('change', () => { toggleOtro(); actualizarIconoCategoria(); });

  function setTipo(tipo) {
    tipoActual = tipo;
    btnGasto.classList.toggle('active', tipo === 'gasto');
    btnIngreso.classList.toggle('active', tipo === 'ingreso');
    btnGasto.setAttribute('aria-pressed', String(tipo === 'gasto'));
    btnIngreso.setAttribute('aria-pressed', String(tipo === 'ingreso'));
    toggleBox.dataset.kind = tipo;                       // el selector se desliza por CSS
    formTx.classList.toggle('income-form', tipo === 'ingreso');
    btnRegTxt.textContent = 'Registrar ' + tipo;
    inpDescripcion.placeholder = tipo === 'gasto' ? 'Ej. Almuerzo en la U' : 'Ej. Entrega de modelado BIM';
    poblarCategorias();
  }

  btnGasto.addEventListener('click', () => setTipo('gasto'));
  btnIngreso.addEventListener('click', () => setTipo('ingreso'));

  // ------------------------------------------------------------
  // Monto: formato en vivo
  // ------------------------------------------------------------
  inpMonto.addEventListener('input', () => {
    const cursorAlFinal = true; // simple: reformatea
    inpMonto.value = fmtInputMientrasEscribe(inpMonto.value);
    if (cursorAlFinal) { /* noop */ }
  });
  inpMonto.addEventListener('focus', () => montoBox.classList.add('focus'));
  inpMonto.addEventListener('blur',  () => montoBox.classList.remove('focus'));

  // ------------------------------------------------------------
  // Fecha
  // ------------------------------------------------------------
  document.querySelectorAll('input[name="modoFecha"]').forEach(r => {
    r.addEventListener('change', () => {
      const otra = document.querySelector('input[name="modoFecha"]:checked').value === 'otra';
      fechaWrap.hidden = !otra;
      if (otra && !inpFecha.value) inpFecha.value = fechaISO();
    });
  });

  function fechaParaEnviar() {
    const modo = document.querySelector('input[name="modoFecha"]:checked').value;
    if (modo === 'hoy' || !inpFecha.value) return null;      // backend usa "now"
    return inpFecha.value + 'T12:00:00';                     // mediodía = sin líos de zona horaria
  }

  // ------------------------------------------------------------
  // Cola offline
  // ------------------------------------------------------------
  function refrescarColaBadge() {
    const n = Cola.count();
    colaBadge.hidden = n === 0;
    colaCount.textContent = n;
  }

  async function intentarVaciarCola() {
    if (!Cola.count()) return;
    const enviadas = await Cola.vaciar();
    if (enviadas > 0) mostrarToast(`✓ ${enviadas} pendiente(s) sincronizada(s)`, 'ok');
    refrescarColaBadge();
  }

  window.addEventListener('online', intentarVaciarCola);

  // ------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------
  formTx.addEventListener('submit', (e) => {
    e.preventDefault();
    const monto = parseMonto(inpMonto.value);
    if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido', 'error'); inpMonto.focus(); return; }
    if (!selCategoria.value)  { mostrarToast('Elige una categoría', 'error'); return; }

    let categoria = selCategoria.value;
    if (categoria === 'Otro') {
      const otra = inpOtraCategoria.value.trim();
      if (otra) categoria = otra;   // categoría personalizada que escribió el usuario
    }

    const tx = {
      tipo: tipoActual,
      categoria: categoria,
      subcategoria: '',
      monto,
      descripcion: inpDescripcion.value.trim(),
      fuente: 'form',
    };
    const fecha = fechaParaEnviar();
    if (fecha) tx.fecha = fecha;

    // Mandamos la MISMA ventana de "meses recientes" que pide el dashboard
    // (mesesAnteriores(mes,3)) para que el backend, que ya deja el Sheet
    // abierto para escribir, precaliente la caché con la clave EXACTA que
    // el dashboard va a pedir después. Así la próxima carga sale de caché
    // en vez de volver a pagar el costo de abrir el Sheet.
    const mesTx = (tx.fecha || fechaISO()).slice(0, 7);
    tx.mesesRecientes = mesesAnteriores(mesTx, 3).join(',');

    // UI optimista: Apps Script (cuenta gratuita) puede tardar de 2 a 30+
    // segundos en confirmar un registro (medido). No tiene sentido bloquear
    // al usuario esperando eso — se muestra "Registrado" YA y el form se
    // limpia al instante; el envío real ocurre en segundo plano. Si de
    // verdad falla, cae a la misma cola offline que ya existía para cuando
    // no hay conexión (se reintenta sola más adelante).
    mostrarToast('✓ Registrado', 'ok');
    limpiarForm();

    Sheets.crear(tx)
      .then(() => {
        // El backend ya dejó la caché de este mes precalentada (misma
        // llamada que escribió). Este GET ahora es rápido, no un recálculo.
        CacheDash.precargar(mesTx, tx.mesesRecientes);
        return intentarVaciarCola(); // por si había pendientes de antes
      })
      .catch(() => {
        Cola.agregar(tx);
        refrescarColaBadge();
        mostrarToast('⚠ No se pudo confirmar — se reintentará solo', 'error');
      });
  });

  function limpiarForm() {
    inpMonto.value = '';
    inpDescripcion.value = '';
    inpOtraCategoria.value = '';
    document.querySelector('input[name="modoFecha"][value="hoy"]').checked = true;
    fechaWrap.hidden = true;
    inpMonto.focus();
  }

  // ------------------------------------------------------------
  // Configuración (conexión)
  // ------------------------------------------------------------
  function abrirConfig() {
    const c = Conexion.get();
    cfgUrl.value = c.url;
    cfgToken.value = c.token;
    cfgEstado.textContent = '';
    cfgEstado.className = 'cfg-estado';
    cfgOverlay.hidden = false;
  }
  function cerrarConfig() { cfgOverlay.hidden = true; }

  btnConfig.addEventListener('click', abrirConfig);

  // Cerrar el overlay de conexión sin obligar a llenarlo: X, clic afuera o Esc.
  document.querySelector('#btnCerrarCfg').addEventListener('click', cerrarConfig);
  cfgOverlay.addEventListener('click', (e) => { if (e.target === cfgOverlay) cerrarConfig(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cfgOverlay.hidden) cerrarConfig(); });

  btnGuardarCfg.addEventListener('click', async () => {
    const url = cfgUrl.value.trim();
    const token = cfgToken.value.trim();
    if (!url || !token) { cfgEstado.textContent = 'Completa URL y token'; cfgEstado.className = 'cfg-estado error'; return; }

    btnGuardarCfg.disabled = true;
    cfgEstado.textContent = 'Probando conexión…';
    cfgEstado.className = 'cfg-estado';
    Conexion.set(url, token);
    try {
      await Sheets.probar();
      cfgEstado.textContent = '✓ Conectado';
      cfgEstado.className = 'cfg-estado ok';
      setTimeout(cerrarConfig, 700);
    } catch (err) {
      cfgEstado.textContent = '✗ No conecta: ' + err.message;
      cfgEstado.className = 'cfg-estado error';
    } finally {
      btnGuardarCfg.disabled = false;
    }
  });

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  function init() {
    const hoy = new Date();
    $('#lblHoy').textContent = 'Hoy, ' + hoy.getDate() + ' ' + MESES_ES[hoy.getMonth()].slice(0, 3).toLowerCase() + '.';
    setTipo('gasto');
    refrescarColaBadge();
    if (!Conexion.configurada()) abrirConfig();
    else {
      intentarVaciarCola();
      // Precarga el dashboard del mes actual en segundo plano mientras el
      // usuario llena el form — si Apps Script tarda (3-18s típico en cuenta
      // gratuita), cuando vuelva al dashboard probablemente ya esté cacheado.
      const mes = mesActualYYYYMM();
      CacheDash.precargar(mes, mesesAnteriores(mes, 3).join(','));
    }

  }
  init();
})();
