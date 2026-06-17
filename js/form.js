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
  const thumb       = $('#toggleThumb');
  const selCategoria = $('#selCategoria');
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
    selCategoria.innerHTML = cats.map(c => {
      const ic = infoCategoria(c).icon;
      return `<option value="${c}">${ic}  ${c}</option>`;
    }).join('');
  }

  function setTipo(tipo) {
    tipoActual = tipo;
    btnGasto.classList.toggle('active', tipo === 'gasto');
    btnIngreso.classList.toggle('active', tipo === 'ingreso');
    thumb.classList.toggle('ingreso', tipo === 'ingreso');
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
      inpFecha.hidden = !otra;
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
  formTx.addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = parseMonto(inpMonto.value);
    if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido', 'error'); inpMonto.focus(); return; }
    if (!selCategoria.value)  { mostrarToast('Elige una categoría', 'error'); return; }

    const tx = {
      tipo: tipoActual,
      categoria: selCategoria.value,
      subcategoria: '',
      monto,
      descripcion: inpDescripcion.value.trim(),
      fuente: 'form',
    };
    const fecha = fechaParaEnviar();
    if (fecha) tx.fecha = fecha;

    btnRegistrar.disabled = true;
    btnRegistrar.textContent = 'Enviando…';

    try {
      await Sheets.crear(tx);
      mostrarToast('✓ Registrado', 'ok');
      limpiarForm();
      intentarVaciarCola(); // por si había pendientes
    } catch (err) {
      // Sin internet o error → guarda offline
      Cola.agregar(tx);
      refrescarColaBadge();
      mostrarToast('✗ Sin conexión — guardado offline', 'error');
      limpiarForm();
    } finally {
      btnRegistrar.disabled = false;
      btnRegistrar.textContent = '+ REGISTRAR';
    }
  });

  function limpiarForm() {
    inpMonto.value = '';
    inpDescripcion.value = '';
    document.querySelector('input[name="modoFecha"][value="hoy"]').checked = true;
    inpFecha.hidden = true;
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
    setTipo('gasto');
    refrescarColaBadge();
    if (!Conexion.configurada()) abrirConfig();
    else intentarVaciarCola();

    if (window.gsap) {
      gsap.from('.form-card', { opacity: 0, y: 30, duration: 0.4, ease: 'power2.out' });
    }
  }
  init();
})();
