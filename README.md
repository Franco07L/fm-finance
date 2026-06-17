# FM Finance 💸

PWA de finanzas personales de Franco Mamani. Registra ingresos y gastos desde el celular (instalada como app) y míralos en un dashboard analítico desde PC o móvil. La base de datos vive en tu propio Google Sheet privado.

**Stack:** HTML + CSS + Vanilla JS (sin frameworks, sin npm) · Chart.js + GSAP por CDN · Google Apps Script + Google Sheets como backend · GitHub Pages como hosting.

---

## 🏗️ Cómo funciona

```
  App (form / dashboard)  ──token──▶  Apps Script (corre "como tú")  ──▶  Google Sheet 🔒 privado
       GitHub Pages         ◀─datos──   (único que toca el Sheet)
```

- El **Sheet queda privado**: solo tu cuenta Google lo ve. La app nunca lo toca directo.
- La **conexión** (URL del Apps Script + token) se guarda en el navegador (`localStorage`), **no en el código** → el repo puede ser público sin exponer nada.
- El **token** vive en las *Propiedades del script* de Apps Script, no en el código.

---

## ⚙️ Setup del backend (una sola vez)

> Los pasos detallados están como comentario al final de [`apps-script/Code.gs`](apps-script/Code.gs).

1. Crea un Google Sheet llamado **`FM_Finance_DB`** con tu cuenta.
2. **Extensiones → Apps Script** → pega todo `Code.gs`.
3. Genera un **token** aleatorio (ej. [uuidgenerator.net](https://www.uuidgenerator.net)). Guárdalo en
   **Configuración del proyecto ⚙ → Propiedades del script** → propiedad `TOKEN`, valor = tu token.
4. Ejecuta la función `setupSheet` una vez (acepta permisos).
5. **Implementar → Nueva implementación → App web** · *Ejecutar como: Yo* · *Acceso: Cualquier usuario* → copia la **URL `/exec`**.
6. Guarda la **URL + token**: los pones en la app la primera vez que la abras (botón ⚙ Configuración).

---

## 🚀 Deploy (GitHub Pages)

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "FM Finance: app completa"
git branch -M main
git remote add origin https://github.com/Franco07L/fm-finance.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Branch: `main` / root → Save**.
A los ~1-2 min tu app estará en:

```
https://franco07l.github.io/fm-finance/
```

---

## 📱 Uso

- **Instalar en el cel:** abre la URL en Chrome → menú → *Agregar a pantalla de inicio*.
- **Primera vez:** toca ⚙ y pega tu URL del Apps Script + token. Listo.
- **Registrar:** [`form.html`](form.html) — toggle Ingreso/Gasto, monto, categoría, fecha.
- **Analizar:** [`index.html`](index.html) — KPIs, gráficos, transacciones, metas. Navega meses con ‹ ›.
- **Sin internet:** los registros se guardan en una cola y se suben solos al volver la conexión.

---

## 👥 Compartir (ej. tu hermana)

No necesita otro repo ni otra app. Solo:
1. Que cree **su propio** Sheet + Apps Script (su propio token) — pasos de arriba.
2. Que abra **la misma URL** del sitio y, en ⚙, pegue **su** URL + token.

Cada quien ve solo sus datos; el sitio es el mismo.

---

## 🎨 Personalizar

- **Categorías:** `CATEGORIA_CONFIG` en [`js/utils.js`](js/utils.js) (fuente única).
- **Presupuestos y metas:** `CONFIG` en [`js/config.js`](js/config.js).
- **Colores / tema:** variables CSS en [`css/base.css`](css/base.css).

> Si cambias archivos después del deploy, sube `CACHE_VERSION` en [`sw.js`](sw.js) (ej. `v1`→`v2`) para que los dispositivos tomen la versión nueva.

---

## 📂 Estructura

```
FM_FINANCE/
├── index.html          Dashboard
├── form.html           Registro
├── manifest.json       PWA
├── sw.js               Service Worker (offline)
├── css/                base · dashboard · form
├── js/                 config · utils · sheets · charts · dashboard · form
├── icons/              icon-192 · icon-512
└── apps-script/Code.gs Backend (pegar en Google Apps Script)
```
