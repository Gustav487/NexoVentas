/* ═══════════════════════════════════════════════════════════════
   NexoVentas — app.js
   Firebase Auth + Google Sheets API v4 + OAuth del usuario
═══════════════════════════════════════════════════════════════ */

// ── CONFIGURACIÓN ──────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBuhqyT4xGGyokxbwaGBQjYbrRc6XZ0MF0",
  authDomain:        "mercado-vendedores.firebaseapp.com",
  projectId:         "mercado-vendedores",
  storageBucket:     "mercado-vendedores.firebasestorage.app",
  messagingSenderId: "577759210383",
  appId:             "1:577759210383:web:8ca403fa2d895faf4579fa"
};
const SPREADSHEET_ID = "130ZEH1QchIO68IUSGA73qTsh-4aUS9D72Vg77sb5zOc";
const SHEETS_SCOPE   = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_BASE    = "https://sheets.googleapis.com/v4/spreadsheets";

// ── DEFAULT DATA ────────────────────────────────────────────────
const DEFAULT_SECCIONES = [
  "Saludo y Presentación",
  "Revisión de Inventario",
  "Negociación y Pedido",
  "Ejecución en Punto de Venta",
  "Cobro y Documentación",
  "Cierre de Visita"
];

const DEFAULT_TAREAS = [
  { seccion: "Saludo y Presentación",      nombre: "Saluda con nombre al cliente" },
  { seccion: "Saludo y Presentación",      nombre: "Se presenta con credencial" },
  { seccion: "Saludo y Presentación",      nombre: "Verifica disponibilidad del encargado" },
  { seccion: "Revisión de Inventario",     nombre: "Revisa stock en bodega" },
  { seccion: "Revisión de Inventario",     nombre: "Revisa stock en exhibición" },
  { seccion: "Revisión de Inventario",     nombre: "Identifica quiebre de stock" },
  { seccion: "Revisión de Inventario",     nombre: "Revisa fechas de vencimiento" },
  { seccion: "Revisión de Inventario",     nombre: "Registra inventario en sistema" },
  { seccion: "Negociación y Pedido",       nombre: "Presenta nuevos productos" },
  { seccion: "Negociación y Pedido",       nombre: "Ofrece promociones vigentes" },
  { seccion: "Negociación y Pedido",       nombre: "Toma el pedido completo" },
  { seccion: "Negociación y Pedido",       nombre: "Negocia espacio adicional" },
  { seccion: "Ejecución en Punto de Venta","nombre": "Verifica planograma" },
  { seccion: "Ejecución en Punto de Venta","nombre": "Coloca material POP" },
  { seccion: "Ejecución en Punto de Venta","nombre": "Acomoda productos en exhibición" },
  { seccion: "Ejecución en Punto de Venta","nombre": "Verifica precios en etiquetas" },
  { seccion: "Ejecución en Punto de Venta","nombre": "Posición privilegiada en anaquel" },
  { seccion: "Ejecución en Punto de Venta","nombre": "Bloqueo de competencia" },
  { seccion: "Cobro y Documentación",      nombre: "Presenta factura anterior" },
  { seccion: "Cobro y Documentación",      nombre: "Realiza cobro / gestión de cartera" },
  { seccion: "Cobro y Documentación",      nombre: "Entrega documentos al cliente" },
  { seccion: "Cierre de Visita",           nombre: "Confirma próxima visita" },
  { seccion: "Cierre de Visita",           nombre: "Agradece al cliente" },
  { seccion: "Cierre de Visita",           nombre: "Registra visita en sistema" },
  { seccion: "Cierre de Visita",           nombre: "Toma foto de evidencia" }
];

const DEFAULT_PRODUCTOS = ["Producto A", "Producto B", "Producto C", "Producto D"];
const DEFAULT_CLIENTES  = ["Cliente 1", "Cliente 2", "Cliente 3", "Cliente 4", "Cliente 5"];
const DEFAULT_COMPETIDORES = [
  { nombre: "Competidor 1", productos: ["Prod C1-1", "Prod C1-2"] },
  { nombre: "Competidor 2", productos: ["Prod C2-1", "Prod C2-2"] }
];

// Opciones de sección — disponible globalmente
const SECCIONES_OPTS = DEFAULT_SECCIONES;

// ── STATE ───────────────────────────────────────────────────────
const state = {
  user:        null,
  accessToken: null,
  rol:         null,       // 'consultor' | 'senior' | 'junior'
  dia:         "A",        // 'A' | 'B'
  semana:      "A",        // 'A' | 'B'
  config:      { clientes: [], tareas: [], productos: [], competidores: [], companyName: 'Empresa' },
  data:        {},         // data[sessionKey][...] matrices
  charts:      {},
};

// session key helper
const sessionKey = () => `${state.dia}${state.semana}`;

// ── FIREBASE INIT ───────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const auth     = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope(SHEETS_SCOPE);

// ── HELPERS ─────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const sc = $(`screen-${name}`);
  sc.classList.remove('hidden');
  sc.classList.add('active');
}

function showLoading(text = "Cargando...") {
  $("loading-text").textContent = text;
  $("loading-overlay").classList.remove('hidden');
}
function hideLoading() { $("loading-overlay").classList.add('hidden'); }

function showToast(msg, type = 'success') {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); }, 3000);
}

function pct(num, den) {
  if (!den) return '—';
  const v = Math.round((num / den) * 100);
  const cls = v >= 80 ? 'pct-high' : v >= 50 ? 'pct-mid' : 'pct-low';
  return `<span class="pct-cell ${cls}">${v}%</span>`;
}

// ── SHEETS API ──────────────────────────────────────────────────
async function sheetsGet(range) {
  const url = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${state.accessToken}` }
  });
  if (!res.ok) throw new Error(`Sheets GET error: ${res.status}`);
  const json = await res.json();
  return json.values || [];
}

async function sheetsUpdate(range, values) {
  const url = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets PUT error: ${res.status}`);
  }
  return res.json();
}

async function sheetsClear(range) {
  const url = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || res.status;
    // 404 = sheet tab doesn't exist yet — not a fatal error, just skip clear
    if (res.status === 404) {
      console.warn(`sheetsClear: hoja no encontrada (${range}) — se omite el borrado, se sobreescribirá`);
      return;
    }
    throw new Error(`Error al limpiar hoja: ${msg}`);
  }
}

// ── AUTH FLOW ───────────────────────────────────────────────────
$("btn-google-login").addEventListener('click', async () => {
  const errEl = $("login-error");
  errEl.classList.add('hidden');
  try {
    showLoading("Iniciando sesión...");

    // Force account picker every time so the OAuth token is always fresh
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await auth.signInWithPopup(provider);

    // Extract access token — try credentialFromResult first, then _tokenResponse
    let token = null;
    try {
      const cred = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
      token = cred?.accessToken || null;
    } catch(_) {}

    // Fallback: Firebase compat SDK stores it in _tokenResponse
    if (!token) {
      token = result?.credential?.accessToken
           || result?._tokenResponse?.oauthAccessToken
           || null;
    }

    if (!token) throw new Error("No se pudo obtener el token de acceso a Google. Intenta de nuevo.");

    state.accessToken = token;
    await onLoginSuccess(result.user);
  } catch (e) {
    hideLoading();
    errEl.textContent = "Error al iniciar sesión: " + (e.message || e.code || String(e));
    errEl.classList.remove('hidden');
  }
});

$("btn-logout").addEventListener('click', async () => {
  await auth.signOut();
  state.user = null; state.accessToken = null; state.rol = null;
  showScreen('login');
});

async function onLoginSuccess(user) {
  state.user = user;
  showLoading("Verificando permisos...");
  try {
    await loadConfig();
    const rol = await resolveRol(user);
    state.rol = rol;
    applyRolUI(rol);
    updateSessionBadges();
    $("nav-user-name").textContent = user.displayName?.split(' ')[0] || user.email;
    showScreen('app');
    await loadSessionData();
    hideLoading();
    showToast(`Bienvenido/a, ${user.displayName?.split(' ')[0] || 'usuario'} · Rol: ${rol}`, 'success');
  } catch (e) {
    hideLoading();
    $("login-error").textContent = "Error cargando datos: " + e.message;
    $("login-error").classList.remove('hidden');
    showScreen('login');
  }
}

// Dueño de la app — siempre consultor, único consultor inicial
const ADMIN_EMAIL = "gustasantoss487@gmail.com";

async function resolveRol(user) {
  const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
  console.log('[resolveRol] buscando uid:', user.uid, 'correo:', user.email);
  try {
    const rows = await sheetsGet("usuarios!A:E");
    console.log('[resolveRol] filas en sheet:', rows.length, rows);

    const dataRows = rows.filter(r => r.some(c => c));

    // Hoja vacía → solo el admin puede auto-registrarse (la hoja usuarios
    // está protegida; escrituras de otros usuarios fallarían con 403)
    if (dataRows.length === 0) {
      if (isAdmin) {
        console.log('[resolveRol] hoja vacía → registrando admin como consultor');
        await registrarUsuario(user, 'consultor', 1, true);
        return 'consultor';
      }
      showToast('Tu cuenta entró como junior. Pide al consultor que te agregue en Usuarios.', 'info');
      return 'junior';
    }

    // Buscar por UID o correo, saltando fila de encabezado
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const [uid, correo, nombre, rol, activo] = row;
      if (uid === 'uid' || correo === 'correo') continue; // skip header
      const uidMatch    = uid    && uid.trim()    === user.uid;
      const correoMatch = correo && correo.trim().toLowerCase() === user.email.toLowerCase();
      console.log(`[resolveRol] fila ${i}: uid="${uid}" correo="${correo}" rol="${rol}" activo="${activo}" uidMatch=${uidMatch} correoMatch=${correoMatch}`);
      if (uidMatch || correoMatch) {
        if (activo === 'FALSE') throw new Error("Usuario inactivo. Contacta al administrador.");
        // Solo el admin puede escribir en la hoja usuarios (pestaña protegida)
        if (!uidMatch && correoMatch && isAdmin) {
          const sheetRowIndex = rows.indexOf(row) + 1;
          await actualizarUID(user, sheetRowIndex);
        }
        // El admin siempre es consultor, sin importar lo que diga la hoja
        const rolFinal = isAdmin ? 'consultor' : (rol || 'junior').trim().toLowerCase();
        console.log('[resolveRol] encontrado → rol:', rolFinal);
        return rolFinal;
      }
    }

    // No encontrado → el admin se auto-registra; los demás entran como junior
    // sin registrarse (la hoja usuarios está protegida) y el consultor los
    // agrega manualmente en Config > Usuarios
    if (isAdmin) {
      console.log('[resolveRol] admin no encontrado → registrando como consultor');
      await registrarUsuario(user, 'consultor', rows.length + 1, false);
      return 'consultor';
    }
    console.log('[resolveRol] usuario no encontrado → junior (sin registro)');
    showToast('Tu cuenta entró como junior. Pide al consultor que te agregue en Usuarios.', 'info');
    return 'junior';

  } catch (e) {
    if (e.message.includes('inactivo')) throw e;
    // Sin acceso a la hoja o error de red: nunca regalar consultor.
    // Solo el admin conserva su rol; el resto entra como junior.
    console.warn('[resolveRol] error:', e.message, '→', isAdmin ? 'consultor (admin)' : 'junior');
    if (!isAdmin) showToast('Sin acceso al spreadsheet: pide al administrador que lo comparta contigo', 'error');
    return isAdmin ? 'consultor' : 'junior';
  }
}

async function registrarUsuario(user, rol, rowIndex, conEncabezado) {
  try {
    const rows = [];
    if (conEncabezado) rows.push(['uid', 'correo', 'nombre', 'rol', 'activo']);
    rows.push([user.uid, user.email, user.displayName || '', rol, 'TRUE']);
    await sheetsUpdate(`usuarios!A${rowIndex}`, rows);
  } catch(e) {
    console.warn('No se pudo registrar usuario:', e.message);
    showToast('No se pudo registrar tu usuario en la hoja (sin permiso de edición)', 'error');
  }
}

async function actualizarUID(user, rowIndex) {
  try { await sheetsUpdate(`usuarios!A${rowIndex}`, [[user.uid]]); } catch(e) {}
}

function applyRolUI(rol) {
  const badge = $("nav-role-badge");
  badge.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
  badge.className = `role-badge ${rol}`;

  const tabGraficas = document.querySelector('.tab-graficas');
  const tabConfig   = document.querySelector('.tab-config');

  // Junior: solo tablas
  // Senior: tablas + gráficas
  // Consultor: todo
  if (rol === 'junior') {
    tabGraficas.classList.add('hidden');
    tabConfig.classList.add('hidden');
  } else if (rol === 'senior') {
    tabGraficas.classList.remove('hidden');
    tabConfig.classList.add('hidden');
  } else {
    // consultor
    tabGraficas.classList.remove('hidden');
    tabConfig.classList.remove('hidden');
  }

  // Sección usuarios solo para Consultor
  const secUsuarios = $("config-usuarios-section");
  if (secUsuarios) {
    if (rol === 'consultor') secUsuarios.classList.remove('hidden');
    else secUsuarios.classList.add('hidden');
  }
}

// ── CONFIG ──────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const rows = await sheetsGet("configuracion!A:D");
    const clientes = [], tareas = [], productos = [], competidores = [];
    let currentComp = null;
    for (const row of rows.slice(1)) {
      const tipo = (row[0] || '').trim();
      if (tipo === 'cliente')        clientes.push(row[2] || row[1] || '');
      else if (tipo === 'producto_propio') productos.push(row[1] || '');
      else if (tipo === 'tarea')     tareas.push({ seccion: row[1] || '', nombre: row[2] || '' });
      else if (tipo === 'competidor_nombre') {
        currentComp = { nombre: row[1] || '', productos: [] };
        competidores.push(currentComp);
      } else if (tipo === 'competidor_producto' && currentComp) {
        currentComp.productos.push(row[1] || '');
      }
    }
    // Load companyName from config sheet
    let companyName = 'Empresa';
    for (const row of rows.slice(1)) {
      if ((row[0]||'').trim() === 'company_name') { companyName = row[1] || 'Empresa'; break; }
    }
    state.config = {
      clientes:     clientes.length     ? clientes     : [...DEFAULT_CLIENTES],
      tareas:       tareas.length       ? tareas       : [...DEFAULT_TAREAS],
      productos:    productos.length    ? productos    : [...DEFAULT_PRODUCTOS],
      competidores: competidores.length ? competidores : DEFAULT_COMPETIDORES.map(c => ({ ...c, productos: [...c.productos] })),
      companyName
    };
  } catch(e) {
    // Sheet not accessible yet — use defaults
    state.config = {
      clientes:     [...DEFAULT_CLIENTES],
      tareas:       DEFAULT_TAREAS.map(t => ({ ...t })),
      productos:    [...DEFAULT_PRODUCTOS],
      competidores: DEFAULT_COMPETIDORES.map(c => ({ ...c, productos: [...c.productos] }))
    };
  }
}

async function saveConfig() {
  const { clientes, tareas, productos, competidores, companyName } = state.config;
  const values = [['tipo', 'campo1', 'campo2', 'campo3']];
  values.push(['company_name', companyName || 'Empresa', '', '']);
  clientes.forEach(c  => values.push(['cliente', 'ruta-a', c, '']));
  productos.forEach(p => values.push(['producto_propio', p, '', '']));
  tareas.forEach(t    => values.push(['tarea', t.seccion, t.nombre, '']));
  competidores.forEach(comp => {
    values.push(['competidor_nombre', comp.nombre, '', '']);
    comp.productos.forEach(p => values.push(['competidor_producto', p, '', '']));
  });
  await sheetsClear("configuracion!A:D");
  await sheetsUpdate("configuracion!A1", values);
}

// ── SESSION DATA LOAD ───────────────────────────────────────────
async function loadSessionData() {
  const sk = sessionKey();
  if (!state.data[sk]) state.data[sk] = {};
  const d = state.data[sk];

  try {
    const prefix = `${sk}_`;
    // protocolo
    const pRows = await sheetsGet(`protocolo!A:ZZ`);
    if (pRows.length > 1) {
      d.protocolo = {};
      pRows.slice(1).forEach(row => {
        const key = row[0];
        if (key && key.startsWith(prefix)) d.protocolo[key] = row.slice(1);
      });
    }
    // productos
    const prRows = await sheetsGet(`productos_propios!A:ZZ`);
    if (prRows.length > 1) {
      d.cobertura = {}; d.disponibilidad = {};
      prRows.slice(1).forEach(row => {
        const key = row[0];
        if (key && key.startsWith(prefix + 'cob_')) d.cobertura[key] = row.slice(1);
        if (key && key.startsWith(prefix + 'dis_')) d.disponibilidad[key] = row.slice(1);
      });
    }
    // competidores
    const cRows = await sheetsGet(`competidores!A:ZZ`);
    if (cRows.length > 1) {
      d.compCob = {}; d.compDis = {};
      cRows.slice(1).forEach(row => {
        const key = row[0];
        if (key && key.startsWith(prefix + 'ccob_')) d.compCob[key] = row.slice(1);
        if (key && key.startsWith(prefix + 'cdis_')) d.compDis[key] = row.slice(1);
      });
    }
  } catch(e) {
    console.warn("No se pudo cargar datos del Sheet, usando vacíos.", e);
  }

  buildProtocoloTable();
  buildProductosTable();
  buildCompetidoresTable();
  if (state.rol !== 'junior') buildCharts();
  if (state.rol === 'consultor') buildConfigTab();
}

// ── TAB NAVIGATION ──────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    btn.classList.add('active');
    const panel = $(`tab-${btn.dataset.tab}`);
    panel.classList.remove('hidden');
    panel.classList.add('active');
    if (btn.dataset.tab === 'graficas') buildCharts();
    if (btn.dataset.tab === 'config')   buildConfigTab();
  });
});

// ── SESSION SELECTOR ────────────────────────────────────────────
["seg-dia","seg-semana"].forEach(id => {
  $( id).querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      $( id).querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (id === 'seg-dia')    state.dia    = btn.dataset.val;
      if (id === 'seg-semana') state.semana = btn.dataset.val;
      updateSessionBadges();
      showLoading("Cargando sesión...");
      await loadSessionData();
      hideLoading();
    });
  });
});

function updateSessionBadges() {
  const label = `Lunes ${state.dia} · Semana ${state.semana}`;
  ["badge-session","badge-session-prod","badge-session-comp"].forEach(id => {
    if ($(id)) $(id).textContent = label;
  });
}

// ══════════════════════════════════════════════════════════════
// PROTOCOLO TABLE
// ══════════════════════════════════════════════════════════════
function buildProtocoloTable() {
  const { tareas, clientes } = state.config;
  const sk = sessionKey();
  const stored = state.data[sk]?.protocolo || {};
  const canEdit = true; // All roles can edit tables

  // Group tareas by seccion
  const secciones = {};
  tareas.forEach(t => {
    if (!secciones[t.seccion]) secciones[t.seccion] = [];
    secciones[t.seccion].push(t.nombre);
  });

  // THEAD
  const thead = $("protocolo-thead");
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  const thLabel = document.createElement('th'); thLabel.textContent = 'Tarea';
  headerRow.appendChild(thLabel);

  clientes.forEach((c, ci) => {
    const th = document.createElement('th');
    if (canEdit) {
      th.className = 'th-editable';
      th.innerHTML = `<span ondblclick="inlineEditColHeader(this, 'clientes', ${ci})">${c}</span>`;
    } else {
      th.textContent = c;
    }
    headerRow.appendChild(th);
  });

  if (canEdit) {
    const thAdd = document.createElement('th');
    thAdd.className = 'th-add';
    thAdd.title = 'Agregar cliente';
    thAdd.innerHTML = '+';
    thAdd.onclick = () => { state.config.clientes.push('Nuevo Cliente'); buildProtocoloTable(); buildProductosTable(); buildCompetidoresTable(); };
    headerRow.appendChild(thAdd);
    // remove column
    const thDel = document.createElement('th'); thDel.style.width='32px';
    headerRow.appendChild(thDel);
  }
  thead.appendChild(headerRow);

  // TBODY
  const tbody = $("protocolo-tbody");
  tbody.innerHTML = '';
  const seccionNames = Object.keys(secciones);

  seccionNames.forEach((secNombre, si) => {
    const tareasList = secciones[secNombre];

    // Section header row
    const secRow = document.createElement('tr');
    secRow.className = 'section-row';
    const secTd = document.createElement('td');
    const colspan = clientes.length + (canEdit ? 2 : 1);
    secTd.setAttribute('colspan', colspan);
    if (canEdit) {
      secTd.className = 'editable';
      secTd.innerHTML = `<span ondblclick="inlineEditSeccion(this, ${si})">${secNombre}</span>
        <button class="btn-add" style="font-size:11px;padding:2px 8px;margin-left:8px" onclick="addTareaToSeccion('${secNombre}')">+ tarea</button>`;
    } else {
      secTd.textContent = secNombre;
    }
    secRow.appendChild(secTd);
    tbody.appendChild(secRow);

    tareasList.forEach((tarea, ti) => {
      const globalTi = state.config.tareas.findIndex(t => t.seccion === secNombre && t.nombre === tarea);
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.className = 'td-label' + (canEdit ? ' editable' : '');
      if (canEdit) {
        tdLabel.innerHTML = `<span ondblclick="inlineEditTarea(this, ${globalTi})">${tarea}</span>`;
      } else {
        tdLabel.textContent = tarea;
      }
      tr.appendChild(tdLabel);

      const rowKey = `${sk}_${secNombre}_${ti}`;
      const storedRow = stored[rowKey] || [];

      clientes.forEach((c, ci) => {
        const td = document.createElement('td');
        const val = parseInt(storedRow[ci]) || 0;
        td.innerHTML = `<div class="cell-wrap">${makeCellToggle(rowKey, ci, val)}</div>`;
        tr.appendChild(td);
      });

      if (canEdit) {
        const tdDel = document.createElement('td');
        tdDel.className = 'td-remove';
        tdDel.innerHTML = `<button class="btn-row-remove" title="Eliminar tarea" onclick="removeTarea(${globalTi})">×</button>`;
        tr.appendChild(tdDel);
      }
      tbody.appendChild(tr);
    });
  });

  // Add section button
  if (canEdit) {
    const addSecRow = document.createElement('tr');
    const addSecTd = document.createElement('td');
    addSecTd.setAttribute('colspan', clientes.length + 2);
    addSecTd.style.padding = '8px 12px';
    addSecTd.innerHTML = `<button class="row-add-btn" onclick="addSeccion()">+ Agregar sección</button>`;
    addSecRow.appendChild(addSecTd);
    tbody.appendChild(addSecRow);
  }

  buildProtocoloFooter();
}

// ── Inline edit helpers ──
window.inlineEditColHeader = function(span, type, idx) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config[type][idx] = newVal;
    input.replaceWith(Object.assign(document.createElement('span'), {
      textContent: newVal,
      ondblclick: function() { inlineEditColHeader(this, type, idx); }
    }));
    buildProtocoloTable(); buildProductosTable(); buildCompetidoresTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.inlineEditTarea = function(span, globalTi) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config.tareas[globalTi].nombre = newVal;
    input.replaceWith(Object.assign(document.createElement('span'), {
      textContent: newVal,
      ondblclick: function() { inlineEditTarea(this, globalTi); }
    }));
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.inlineEditSeccion = function(span, si) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config.tareas.forEach(t => { if (t.seccion === val) t.seccion = newVal; });
    buildProtocoloTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.inlineEditProducto = function(span, idx) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config.productos[idx] = newVal;
    buildProductosTable();
    buildCompetidoresTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.inlineEditCompetidor = function(span, ci) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config.competidores[ci].nombre = newVal;
    buildCompetidoresTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.inlineEditCompProd = function(span, ci, pi) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config.competidores[ci].productos[pi] = newVal;
    buildCompetidoresTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.inlineEditCompanyName = function(span) {
  const val = span.textContent;
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = val;
  span.replaceWith(input);
  input.focus(); input.select();
  const save = () => {
    const newVal = input.value.trim() || val;
    state.config.companyName = newVal;
    input.replaceWith(Object.assign(document.createElement('span'), {
      textContent: newVal,
      ondblclick: function() { inlineEditCompanyName(this); },
      style: 'cursor:text',
      title: 'Doble clic para editar'
    }));
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } });
};

window.addTareaToSeccion = function(secNombre) {
  state.config.tareas.push({ seccion: secNombre, nombre: 'Nueva tarea' });
  buildProtocoloTable();
};

window.addSeccion = function() {
  const nombre = 'Nueva Sección';
  state.config.tareas.push({ seccion: nombre, nombre: 'Nueva tarea' });
  buildProtocoloTable();
};

window.removeTarea = function(globalTi) {
  state.config.tareas.splice(globalTi, 1);
  buildProtocoloTable();
};

function makeCellToggle(rowKey, ci, val) {
  const labels = ['—','✓','✗'];
  return `<button class="cell-toggle" data-row="${rowKey}" data-ci="${ci}" data-val="${val}" onclick="cycleCell(this)">${labels[val]}</button>`;
}

window.cycleCell = function(btn) {
  let val = parseInt(btn.dataset.val);
  val = (val + 1) % 3;
  btn.dataset.val = val;
  btn.textContent = ['—','✓','✗'][val];

  const rowKey = btn.dataset.row;
  const ci     = parseInt(btn.dataset.ci);
  const sk     = sessionKey();

  // Update in-memory
  if (!state.data[sk])            state.data[sk] = {};
  if (!state.data[sk].protocolo)  state.data[sk].protocolo = {};
  if (!state.data[sk].protocolo[rowKey]) {
    state.data[sk].protocolo[rowKey] = Array(state.config.clientes.length).fill(0);
  }
  state.data[sk].protocolo[rowKey][ci] = val;
  buildProtocoloFooter();
};

function buildProtocoloFooter() {
  const { clientes, tareas } = state.config;
  const sk = sessionKey();
  const stored = state.data[sk]?.protocolo || {};
  const tfoot = $("protocolo-tfoot");
  tfoot.innerHTML = '';

  // Count per client: v1 = cobertura (tareas cumplidas), total valid (not 0)
  const totals = clientes.map(() => ({ yes: 0, total: 0 }));

  Object.values(stored).forEach(row => {
    row.forEach((v, ci) => {
      const val = parseInt(v) || 0;
      if (val > 0) { totals[ci].total++; if (val === 1) totals[ci].yes++; }
    });
  });

  const tr = document.createElement('tr');
  const tdLabel = document.createElement('td');
  tdLabel.textContent = '% Cobertura';
  tr.appendChild(tdLabel);
  clientes.forEach((c, ci) => {
    const td = document.createElement('td');
    td.innerHTML = pct(totals[ci].yes, totals[ci].total);
    tr.appendChild(td);
  });
  tfoot.appendChild(tr);
}

$("btn-save-protocolo").addEventListener('click', async () => {
  await saveProtocolo();
});

async function saveProtocolo() {
  showLoading("Guardando protocolo...");
  try {
    const sk = sessionKey();
    const stored = state.data[sk]?.protocolo || {};
    const rows = [['clave', ...state.config.clientes]];
    Object.entries(stored).forEach(([key, vals]) => {
      rows.push([key, ...vals.map(v => v || 0)]);
    });
    await sheetsClear("protocolo!A:ZZ");
    if (rows.length > 1) await sheetsUpdate("protocolo!A1", rows);
    await logSession("protocolo");
    hideLoading();
    showToast("Protocolo guardado ✓");
  } catch(e) {
    hideLoading();
    showToast("Error al guardar: " + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// PRODUCTOS TABLE
// ══════════════════════════════════════════════════════════════
function buildProductosTable() {
  const { productos, clientes } = state.config;
  const sk = sessionKey();
  const storedCob  = state.data[sk]?.cobertura     || {};
  const storedDisp = state.data[sk]?.disponibilidad || {};

  buildProductSubTable('cobertura', productos, clientes, storedCob,  `${sk}_cob_`);
  buildProductSubTable('disponibilidad', productos, clientes, storedDisp, `${sk}_dis_`);
  if ($(  'badge-session-prod')) $('badge-session-prod').textContent = `Lunes ${state.dia} · Semana ${state.semana}`;
}

function buildProductSubTable(tipo, productos, clientes, stored, prefix) {
  const thead = $(`${tipo}-thead`);
  const tbody = $(`${tipo}-tbody`);
  const tfoot = $(`${tipo}-tfoot`);
  thead.innerHTML = ''; tbody.innerHTML = ''; tfoot.innerHTML = '';
  const canEdit = true; // All roles can edit tables

  // Header
  const hr = document.createElement('tr');
  const thL = document.createElement('th'); thL.textContent = 'Producto'; hr.appendChild(thL);
  clientes.forEach((c, ci) => {
    const th = document.createElement('th');
    if (canEdit) {
      th.className = 'th-editable';
      th.innerHTML = `<span ondblclick="inlineEditColHeader(this,'clientes',${ci})">${c}</span>`;
    } else { th.textContent = c; }
    hr.appendChild(th);
  });
  if (canEdit) {
    const thAdd = document.createElement('th');
    thAdd.className = 'th-add'; thAdd.title = 'Agregar cliente'; thAdd.innerHTML = '+';
    thAdd.onclick = () => { state.config.clientes.push('Nuevo Cliente'); buildProtocoloTable(); buildProductosTable(); buildCompetidoresTable(); };
    hr.appendChild(thAdd);
    const thDel = document.createElement('th'); thDel.style.width='32px'; hr.appendChild(thDel);
  }
  thead.appendChild(hr);

  // Rows
  productos.forEach((prod, pi) => {
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.className = 'td-label' + (canEdit ? ' editable' : '');
    if (canEdit) {
      tdL.innerHTML = `<span ondblclick="inlineEditProducto(this,${pi})">${prod}</span>`;
    } else { tdL.textContent = prod; }
    tr.appendChild(tdL);
    const rowKey = `${prefix}${pi}`;
    const storedRow = stored[rowKey] || [];
    clientes.forEach((c, ci) => {
      const td = document.createElement('td');
      const val = parseInt(storedRow[ci]) || 0;
      td.innerHTML = `<div class="cell-wrap">${makeProdCell(tipo, rowKey, ci, val)}</div>`;
      tr.appendChild(td);
    });
    if (canEdit) {
      const tdDel = document.createElement('td'); tdDel.className = 'td-remove';
      tdDel.innerHTML = `<button class="btn-row-remove" onclick="removeProducto(${pi})">×</button>`;
      tr.appendChild(tdDel);
    }
    tbody.appendChild(tr);
  });

  // Add row button
  if (canEdit) {
    const addRow = document.createElement('tr');
    const addTd = document.createElement('td');
    addTd.setAttribute('colspan', clientes.length + 2);
    addTd.style.padding = '8px 12px';
    addTd.innerHTML = `<button class="row-add-btn" onclick="addProducto()">+ Agregar producto</button>`;
    addRow.appendChild(addTd); tbody.appendChild(addRow);
  }

  // Footer
  const totals = clientes.map(() => ({ yes: 0, total: 0 }));
  Object.values(stored).forEach(row => {
    row.forEach((v, ci) => {
      const val = parseInt(v) || 0;
      if (val > 0) { totals[ci].total++; if (val === 1) totals[ci].yes++; }
    });
  });
  const tfr = document.createElement('tr');
  const tfl = document.createElement('td'); tfl.textContent = tipo === 'cobertura' ? '% Cobertura' : '% Disponibilidad'; tfr.appendChild(tfl);
  clientes.forEach((c, ci) => { const td = document.createElement('td'); td.innerHTML = pct(totals[ci].yes, totals[ci].total); tfr.appendChild(td); });
  if (canEdit) { const td = document.createElement('td'); tfr.appendChild(td); const td2 = document.createElement('td'); tfr.appendChild(td2); }
  tfoot.appendChild(tfr);
}

window.addProducto = function() {
  state.config.productos.push('Nuevo Producto');
  buildProductosTable();
};
window.removeProducto = function(pi) {
  state.config.productos.splice(pi, 1);
  buildProductosTable();
};

function makeProdCell(tipo, rowKey, ci, val) {
  return `<button class="cell-toggle" data-tipo="${tipo}" data-row="${rowKey}" data-ci="${ci}" data-val="${val}" onclick="cycleProdCell(this)">${['—','✓','✗'][val]}</button>`;
}

window.cycleProdCell = function(btn) {
  let val = (parseInt(btn.dataset.val) + 1) % 3;
  btn.dataset.val = val;
  btn.textContent = ['—','✓','✗'][val];
  const tipo   = btn.dataset.tipo;
  const rowKey = btn.dataset.row;
  const ci     = parseInt(btn.dataset.ci);
  const sk     = sessionKey();
  if (!state.data[sk])             state.data[sk] = {};
  const bucket = tipo === 'cobertura' ? 'cobertura' : 'disponibilidad';
  if (!state.data[sk][bucket])     state.data[sk][bucket] = {};
  if (!state.data[sk][bucket][rowKey]) {
    state.data[sk][bucket][rowKey] = Array(state.config.clientes.length).fill(0);
  }
  state.data[sk][bucket][rowKey][ci] = val;
  buildProductSubTable(tipo, state.config.productos, state.config.clientes,
    state.data[sk][bucket], rowKey.split('_').slice(0,2).join('_') + '_');
};

$("btn-save-productos").addEventListener('click', async () => {
  showLoading("Guardando productos...");
  try {
    const sk = sessionKey();
    const rowsCob  = [['clave', ...state.config.clientes]];
    const rowsDisp = [['clave', ...state.config.clientes]];
    Object.entries(state.data[sk]?.cobertura || {}).forEach(([k,v])     => rowsCob.push([k, ...v.map(x=>x||0)]));
    Object.entries(state.data[sk]?.disponibilidad || {}).forEach(([k,v])=> rowsDisp.push([k, ...v.map(x=>x||0)]));
    await sheetsClear("productos_propios!A:ZZ");
    const allRows = [...rowsCob, ...rowsDisp.slice(1)];
    if (allRows.length > 1) await sheetsUpdate("productos_propios!A1", allRows);
    await logSession("productos_propios");
    hideLoading(); showToast("Productos guardados ✓");
  } catch(e) { hideLoading(); showToast("Error: " + e.message, 'error'); }
});

// ══════════════════════════════════════════════════════════════
// COMPETIDORES TABLE
// ══════════════════════════════════════════════════════════════
function buildCompetidoresTable() {
  const { competidores, clientes, productos } = state.config;
  const sk = sessionKey();
  const storedCob  = state.data[sk]?.compCob || {};
  const storedDisp = state.data[sk]?.compDis || {};

  buildCompSubTable('comp-cob',  'Cobertura',      competidores, productos, clientes, storedCob,  `${sk}_ccob_`);
  buildCompSubTable('comp-disp', 'Disponibilidad', competidores, productos, clientes, storedDisp, `${sk}_cdis_`);
}

function buildCompSubTable(prefix, label, competidores, propios, clientes, stored, keyPrefix) {
  const thead = $(`${prefix}-thead`);
  const tbody = $(`${prefix}-tbody`);
  thead.innerHTML = ''; tbody.innerHTML = '';
  const canEdit = true; // All roles can edit tables
  const totalCompCols = competidores.reduce((s,c) => s + c.productos.length, 0);
  const totalCols = 1 + 1 + totalCompCols + (canEdit ? 1 : 0);

  // Header
  const hr = document.createElement('tr');
  const thL = document.createElement('th'); thL.textContent = 'Producto'; hr.appendChild(thL);

  // Empresa sticky — editable company name
  const thE = document.createElement('th');
  thE.className = 'th-company';
  const compName = state.config.companyName || 'Empresa';
  if (canEdit) {
    thE.innerHTML = `<span ondblclick="inlineEditCompanyName(this)" style="cursor:text" title="Doble clic para editar">${compName}</span>`;
  } else {
    thE.textContent = compName;
  }
  hr.appendChild(thE);

  competidores.forEach((comp, ci) => {
    comp.productos.forEach((p, pi) => {
      const th = document.createElement('th');
      if (canEdit) {
        th.innerHTML = `<div style="font-size:10px;color:var(--green);font-weight:600;margin-bottom:2px">
          <span ondblclick="inlineEditCompetidor(this,${ci})" style="cursor:text" title="Doble clic para editar">${comp.nombre}</span>
          <button onclick="addCompetidorProducto(${ci})" style="background:none;border:none;color:var(--green);cursor:pointer;font-size:13px;padding:0 2px" title="Agregar producto">+</button>
        </div>
        <span ondblclick="inlineEditCompProd(this,${ci},${pi})" style="cursor:text;font-size:12px" title="Doble clic para editar">${p}</span>
        <button onclick="removeCompetidorProducto(${ci},${pi})" style="background:none;border:none;color:var(--gray-500);cursor:pointer;font-size:11px;margin-left:2px" title="Eliminar">×</button>`;
      } else {
        th.innerHTML = `<div style="font-size:10px;color:var(--green);font-weight:600;margin-bottom:2px">${comp.nombre}</div><span style="font-size:12px">${p}</span>`;
      }
      hr.appendChild(th);
    });
  });

  if (canEdit) {
    const thAdd = document.createElement('th');
    thAdd.className = 'th-add'; thAdd.title = 'Agregar competidor'; thAdd.innerHTML = '+';
    thAdd.onclick = () => {
      if (competidores.length >= 6) return showToast('Máximo 6 competidores','info');
      state.config.competidores.push({ nombre: 'Competidor', productos: ['Producto'] });
      buildCompetidoresTable();
    };
    hr.appendChild(thAdd);
  }
  thead.appendChild(hr);

  // Rows per client
  clientes.forEach((cliente, cliIdx) => {
    const clientRow = document.createElement('tr');
    clientRow.className = 'section-row';
    const clientTd = document.createElement('td');
    clientTd.setAttribute('colspan', totalCols);
    if (canEdit) {
      clientTd.className = 'editable';
      clientTd.innerHTML = `<span ondblclick="inlineEditColHeader(this,'clientes',${cliIdx})">${cliente}</span>`;
    } else { clientTd.textContent = cliente; }
    clientRow.appendChild(clientTd);
    tbody.appendChild(clientRow);

    propios.forEach((prod, prodIdx) => {
      const tr = document.createElement('tr');
      const tdL = document.createElement('td');
      tdL.className = 'td-label' + (canEdit ? ' editable' : '');
      if (canEdit) {
        tdL.innerHTML = `<span ondblclick="inlineEditProducto(this,${prodIdx})" style="cursor:text" title="Doble clic para editar">${prod}</span>`;
      } else { tdL.textContent = prod; }
      tr.appendChild(tdL);

      // Empresa propia (sticky, editable mirror de Productos)
      const empresaBucket = prefix === 'comp-cob' ? 'cobertura' : 'disponibilidad';
      const empresaKey = `${sessionKey()}_${prefix === 'comp-cob' ? 'cob' : 'dis'}_${prodIdx}`;
      const empresaData = state.data[sessionKey()]?.[empresaBucket] || {};
      const empresaVal = parseInt((empresaData[empresaKey] || [])[cliIdx]) || 0;
      const tdE = document.createElement('td'); tdE.className = 'td-company';
      tdE.innerHTML = `<div class="cell-wrap"><button class="cell-toggle" data-tipo="${empresaBucket}" data-row="${empresaKey}" data-ci="${cliIdx}" data-val="${empresaVal}" onclick="cycleEmpresaCell(this)">${['—','✓','✗'][empresaVal]}</button></div>`;
      tr.appendChild(tdE);

      competidores.forEach((comp, compIdx) => {
        comp.productos.forEach((cprod, cprodIdx) => {
          const td = document.createElement('td');
          const rowKey = `${keyPrefix}${cliIdx}_${compIdx}_${cprodIdx}_${prodIdx}`;
          const val = parseInt((stored[rowKey] || [])[0]) || 0;
          td.innerHTML = `<div class="cell-wrap">${makeCompCell(prefix, rowKey, val)}</div>`;
          tr.appendChild(td);
        });
      });
      if (canEdit) { const tdSp = document.createElement('td'); tr.appendChild(tdSp); }
      tbody.appendChild(tr);
    });
  });

  // Add client button
  if (canEdit) {
    const addRow = document.createElement('tr');
    const addTd = document.createElement('td');
    addTd.setAttribute('colspan', totalCols);
    addTd.style.padding = '8px 12px';
    addTd.innerHTML = `<button class="row-add-btn" onclick="addClienteInline()">+ Agregar cliente</button>`;
    addRow.appendChild(addTd); tbody.appendChild(addRow);
  }
}

window.addClienteInline = function() {
  state.config.clientes.push('Nuevo Cliente');
  buildProtocoloTable(); buildProductosTable(); buildCompetidoresTable();
};
window.addCompetidorProducto = function(ci) {
  if (state.config.competidores[ci].productos.length >= 10) return showToast('Máximo 10 productos','info');
  state.config.competidores[ci].productos.push('Nuevo Producto');
  buildCompetidoresTable();
};
window.removeCompetidorProducto = function(ci, pi) {
  state.config.competidores[ci].productos.splice(pi, 1);
  if (state.config.competidores[ci].productos.length === 0)
    state.config.competidores.splice(ci, 1);
  buildCompetidoresTable();
};

// Celda Empresa en Competidores — espejo editable de Productos (cobertura/disponibilidad)
window.cycleEmpresaCell = function(btn) {
  const val = (parseInt(btn.dataset.val) + 1) % 3;
  const bucket = btn.dataset.tipo;
  const rowKey = btn.dataset.row;
  const ci     = parseInt(btn.dataset.ci);
  const sk     = sessionKey();
  if (!state.data[sk])               state.data[sk] = {};
  if (!state.data[sk][bucket])       state.data[sk][bucket] = {};
  if (!state.data[sk][bucket][rowKey]) {
    state.data[sk][bucket][rowKey] = Array(state.config.clientes.length).fill(0);
  }
  state.data[sk][bucket][rowKey][ci] = val;
  buildProductosTable();
  buildCompetidoresTable();
};

function makeCompCell(prefix, rowKey, val) {
  return `<button class="cell-toggle" data-prefix="${prefix}" data-row="${rowKey}" data-val="${val}" onclick="cycleCompCell(this)">${['—','✓','✗'][val]}</button>`;
}

window.cycleCompCell = function(btn) {
  let val = (parseInt(btn.dataset.val) + 1) % 3;
  btn.dataset.val = val; btn.textContent = ['—','✓','✗'][val];
  const prefix = btn.dataset.prefix;
  const rowKey = btn.dataset.row;
  const sk = sessionKey();
  if (!state.data[sk]) state.data[sk] = {};
  const bucket = prefix === 'comp-cob' ? 'compCob' : 'compDis';
  if (!state.data[sk][bucket]) state.data[sk][bucket] = {};
  state.data[sk][bucket][rowKey] = [val];
};

$("btn-save-competidores").addEventListener('click', async () => {
  showLoading("Guardando competidores...");
  try {
    const sk = sessionKey();
    const rowsCob  = [['clave', 'valor']];
    const rowsDisp = [['clave', 'valor']];
    Object.entries(state.data[sk]?.compCob || {}).forEach(([k,v]) => rowsCob.push([k, v[0]||0]));
    Object.entries(state.data[sk]?.compDis || {}).forEach(([k,v]) => rowsDisp.push([k, v[0]||0]));
    await sheetsClear("competidores!A:ZZ");
    const all = [...rowsCob, ...rowsDisp.slice(1)];
    if (all.length > 1) await sheetsUpdate("competidores!A1", all);
    await logSession("competidores");
    hideLoading(); showToast("Competidores guardados ✓");
  } catch(e) { hideLoading(); showToast("Error: " + e.message, 'error'); }
});

// ══════════════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════════════
let currentChartType = 'bar'; // persists across rebuilds

// Wire chart type switcher (delegated — works even if tab hidden on load)
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-chart-type]');
  if (!btn) return;
  currentChartType = btn.dataset.chartType;
  document.querySelectorAll('[data-chart-type]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  buildCharts();
});

function buildCharts() {
  const sk = sessionKey();
  const { tareas, productos, competidores } = state.config;
  const protocolo = state.data[sk]?.protocolo || {};
  const cType = currentChartType; // 'bar' | 'line' | 'pie'
  const isPie = cType === 'pie';

  // Destroy existing
  Object.values(state.charts).forEach(c => c.destroy && c.destroy());
  state.charts = {};

  const isLight = document.body.classList.contains('light');
  const tickColor   = isLight ? '#5A5A5A' : '#7A7A7A';
  const gridColor   = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
  const legendColor = isLight ? '#3D3D3D' : '#A0A0A0';

  // Pie charts don't use scales
  const scaleOpts = isPie ? {} : {
    scales: {
      x: { ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor } },
      y: { ticks: { color: tickColor, font: { size: 11 }, callback: v => v + '%' }, grid: { color: gridColor }, min: 0, max: 100 }
    }
  };

  // Leyenda compartida: a la izquierda en sectores, arriba en barras/líneas
  const legendOpts = { display: true, position: isPie ? 'left' : 'top', labels: { color: legendColor, font: { size: 11 } } };

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { ...legendOpts, display: isPie } },
    ...scaleOpts
  };

  // Helper: dataset style per chart type
  const ds1 = (data, label) => ({
    label,
    data,
    backgroundColor: isPie
      ? data.map((_, i) => `hsl(${(i * 47) % 360},60%,55%)`)
      : 'rgba(73,162,89,0.7)',
    borderColor: isPie ? '#fff' : '#49A259',
    borderWidth: isPie ? 2 : 1,
    borderRadius: cType === 'bar' ? 4 : 0,
    fill: cType === 'line' ? false : undefined,
    tension: cType === 'line' ? 0.35 : undefined,
    pointBackgroundColor: cType === 'line' ? '#49A259' : undefined,
    pointRadius: cType === 'line' ? 4 : undefined,
  });

  const ds2 = (data, label) => ({
    label,
    data,
    backgroundColor: isPie
      ? data.map((_, i) => `hsl(${(i * 47 + 20) % 360},60%,55%)`)
      : 'rgba(238,129,73,0.7)',
    borderColor: isPie ? '#fff' : '#EE8149',
    borderWidth: isPie ? 2 : 1,
    borderRadius: cType === 'bar' ? 4 : 0,
    fill: cType === 'line' ? false : undefined,
    tension: cType === 'line' ? 0.35 : undefined,
    pointBackgroundColor: cType === 'line' ? '#EE8149' : undefined,
    pointRadius: cType === 'line' ? 4 : undefined,
  });

  // ── Chart 1: % Cobertura por Sección ──
  const secciones = [...new Set(tareas.map(t => t.seccion))];
  const secData = secciones.map(sec => {
    const secTareas = tareas.filter(t => t.seccion === sec);
    let yes = 0, total = 0;
    secTareas.forEach((t, i) => {
      const key = `${sk}_${sec}_${i}`;
      (protocolo[key] || []).forEach(v => {
        const vv = parseInt(v) || 0;
        if (vv > 0) { total++; if (vv === 1) yes++; }
      });
    });
    return total ? Math.round((yes / total) * 100) : 0;
  });

  const ctx1 = $("chart-cobertura-seccion");
  if (ctx1) {
    const labels1 = secciones; // full names, no truncation
    if (isPie) {
      state.charts.c1 = new Chart(ctx1, {
        type: 'pie',
        data: { labels: labels1, datasets: [ds1(secData, 'Cobertura')] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: legendOpts, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}%` } } } }
      });
    } else {
      state.charts.c1 = new Chart(ctx1, {
        type: cType,
        data: { labels: labels1, datasets: [ds1(secData, 'Cobertura')] },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: legendOpts, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } } } }
      });
    }
  }

  // ── Chart 2: Cobertura vs Disponibilidad por Producto ──
  const cobProdData = productos.map((p, pi) => {
    const key = `${sk}_cob_${pi}`; let yes = 0, total = 0;
    (state.data[sk]?.cobertura?.[key] || []).forEach(v => {
      const vv = parseInt(v)||0; if (vv>0){total++;if(vv===1)yes++;}
    });
    return total ? Math.round((yes/total)*100) : 0;
  });
  const dispProdData = productos.map((p, pi) => {
    const key = `${sk}_dis_${pi}`; let yes = 0, total = 0;
    (state.data[sk]?.disponibilidad?.[key] || []).forEach(v => {
      const vv = parseInt(v)||0; if (vv>0){total++;if(vv===1)yes++;}
    });
    return total ? Math.round((yes/total)*100) : 0;
  });

  const ctx2 = $("chart-disp-productos");
  if (ctx2) {
    // Pie: merge into one dataset with alternating colors
    const data2 = isPie
      ? { labels: productos, datasets: [{ ...ds1(cobProdData,'Cobertura'), label: 'Cobertura' }] }
      : { labels: productos, datasets: [ds1(cobProdData,'Cobertura'), ds2(dispProdData,'Disponibilidad')] };
    state.charts.c2 = new Chart(ctx2, {
      type: isPie ? 'pie' : cType,
      data: data2,
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: legendOpts, tooltip: { callbacks: { label: ctx => `${isPie ? ctx.label : ctx.dataset.label}: ${ctx.raw}%` } } } }
    });
  }

  // ── Chart 3: Cobertura vs Disponibilidad por Empresa ──
  const empresaLabels = [state.config.companyName || 'Empresa', ...competidores.map(c => c.nombre)];
  const calcAvg = (bucket) => {
    let yes = 0, total = 0;
    Object.values(state.data[sk]?.[bucket] || {}).forEach(row => {
      row.forEach(v => { const vv=parseInt(v)||0; if(vv>0){total++;if(vv===1)yes++;} });
    });
    return total ? Math.round((yes/total)*100) : 0;
  };
  const calcCompAvg = (bucket) => competidores.map((comp, ci) => {
    let yes = 0, total = 0;
    Object.entries(state.data[sk]?.[bucket] || {}).forEach(([key, val]) => {
      if (key.includes(`_${ci}_`)) {
        const v = parseInt(Array.isArray(val) ? val[0] : val)||0;
        if (v>0){total++;if(v===1)yes++;}
      }
    });
    return total ? Math.round((yes/total)*100) : 0;
  });
  const empresaCob  = [calcAvg('cobertura'),     ...calcCompAvg('compCob')];
  const empresaDisp = [calcAvg('disponibilidad'), ...calcCompAvg('compDis')];

  const ctx3 = $("chart-cliente-comparativa");
  if (ctx3) {
    const data3 = isPie
      ? { labels: empresaLabels, datasets: [ds1(empresaCob,'Cobertura')] }
      : { labels: empresaLabels, datasets: [ds1(empresaCob,'Cobertura'), ds2(empresaDisp,'Disponibilidad')] };
    state.charts.c3 = new Chart(ctx3, {
      type: isPie ? 'pie' : cType,
      data: data3,
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: legendOpts, tooltip: { callbacks: { label: ctx => `${isPie ? ctx.label : (ctx.dataset?.label || ctx.label)}: ${ctx.raw}%` } } } }
    });
  }
}

// ══════════════════════════════════════════════════════════════
// CONFIG TAB
// ══════════════════════════════════════════════════════════════
function buildConfigTab() {
  buildClientesList();
  buildProductosList();
  buildTareasList();
  buildCompetidoresList();
  // Usuarios section visibility
  const secUsuarios = $("config-section-usuarios");
  const navUsuarios = $("config-nav-usuarios");
  if (state.rol === 'consultor') {
    if (secUsuarios) secUsuarios.style.display = '';
    if (navUsuarios) navUsuarios.style.display = '';
    buildUsuariosList();
  } else {
    if (secUsuarios) secUsuarios.style.display = 'none';
    if (navUsuarios) navUsuarios.style.display = 'none';
  }
}

// ── Clientes ──
function buildClientesList() {
  const list = $("list-clientes"); if (!list) return;
  list.innerHTML = '';
  state.config.clientes.forEach((c, i) => {
    const div = document.createElement('div'); div.className = 'config-item';
    div.innerHTML = `<span class="config-item-num">${i+1}</span>
      <input type="text" value="${c}" placeholder="Nombre del cliente" data-idx="${i}" data-type="clientes" />
      <button class="btn-remove" data-action="remove-config" data-type="clientes" data-idx="${i}">×</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => { state.config.clientes[parseInt(e.target.dataset.idx)] = e.target.value; });
  });
}

// ── Productos ──
function buildProductosList() {
  const list = $("list-productos"); if (!list) return;
  list.innerHTML = '';
  state.config.productos.forEach((p, i) => {
    const div = document.createElement('div'); div.className = 'config-item';
    div.innerHTML = `<span class="config-item-num">${i+1}</span>
      <input type="text" value="${p}" placeholder="Nombre del producto" data-idx="${i}" data-type="productos" />
      <button class="btn-remove" data-action="remove-config" data-type="productos" data-idx="${i}">×</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', e => { state.config.productos[parseInt(e.target.dataset.idx)] = e.target.value; });
  });
}

// ── Tareas ──
function buildTareasList() {
  const list = $("list-tareas"); if (!list) return;
  list.innerHTML = '';
  // Get all unique secciones from current tareas + defaults
  const allSecs = [...new Set([...SECCIONES_OPTS, ...state.config.tareas.map(t => t.seccion)])];
  state.config.tareas.forEach((t, i) => {
    const div = document.createElement('div'); div.className = 'config-item';
    const opts = allSecs.map(s => `<option value="${s}" ${s===t.seccion?'selected':''}>${s}</option>`).join('');
    div.innerHTML = `<select data-idx="${i}" data-field="seccion" data-action="tarea-change">${opts}</select>
      <input type="text" value="${t.nombre}" placeholder="Nombre de la tarea" data-idx="${i}" data-field="nombre" data-action="tarea-change" />
      <button class="btn-remove" data-action="remove-config" data-type="tareas" data-idx="${i}">×</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.idx);
      state.config.tareas[idx][e.target.dataset.field] = e.target.value;
    });
    inp.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx);
      state.config.tareas[idx][e.target.dataset.field] = e.target.value;
    });
  });
}

// ── Competidores ──
function buildCompetidoresList() {
  const list = $("list-competidores-config"); if (!list) return;
  list.innerHTML = '';
  state.config.competidores.forEach((comp, ci) => {
    const block = document.createElement('div'); block.className = 'comp-config-block';
    const prods = comp.productos.map((p, pi) =>
      `<div class="config-item">
        <span class="config-item-num">${pi+1}</span>
        <input type="text" value="${p}" placeholder="Producto" data-ci="${ci}" data-pi="${pi}" data-action="comp-prod-change" />
        <button class="btn-remove" data-action="remove-comp-prod" data-ci="${ci}" data-pi="${pi}">×</button>
       </div>`
    ).join('');
    block.innerHTML = `
      <div class="comp-config-header">
        <span class="config-item-num">${ci+1}</span>
        <input type="text" value="${comp.nombre}" placeholder="Nombre del competidor" data-ci="${ci}" data-action="comp-name-change" />
        <button class="btn-remove" data-action="remove-config" data-type="competidores" data-idx="${ci}">×</button>
      </div>
      <div class="comp-products-list" id="comp-prods-${ci}">${prods}</div>
      <button class="btn-add-sub" data-action="add-comp-prod" data-ci="${ci}">+ Producto</button>`;
    list.appendChild(block);
  });
  // Bind inputs via event listeners (not inline handlers)
  list.querySelectorAll('[data-action="comp-name-change"]').forEach(inp => {
    inp.addEventListener('input', e => {
      state.config.competidores[parseInt(e.target.dataset.ci)].nombre = e.target.value;
    });
  });
  list.querySelectorAll('[data-action="comp-prod-change"]').forEach(inp => {
    inp.addEventListener('input', e => {
      state.config.competidores[parseInt(e.target.dataset.ci)].productos[parseInt(e.target.dataset.pi)] = e.target.value;
    });
  });
}

// ── Remove helpers ──
window.removeConfigItem = (type, idx) => {
  state.config[type].splice(idx, 1);
  if (type === 'clientes')     buildClientesList();
  if (type === 'productos')    buildProductosList();
  if (type === 'tareas')       buildTareasList();
  if (type === 'competidores') buildCompetidoresList();
};

// ── Usuarios ──
let usuariosCache = [];
async function buildUsuariosList() {
  const list = $("list-usuarios"); if (!list) return;
  list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px">Cargando usuarios...</div>';
  try {
    const rows = await sheetsGet("usuarios!A:E");
    usuariosCache = rows.filter(r => r.some(c=>c) && r[0] !== 'uid').map(r => ({
      uid: r[0]||'', correo: r[1]||'', nombre: r[2]||'', rol: r[3]||'junior', activo: r[4] !== 'FALSE'
    }));
  } catch(e) { usuariosCache = []; }
  renderUsuariosList();
}
function renderUsuariosList() {
  const list = $("list-usuarios"); if (!list) return;
  list.innerHTML = '';
  if (usuariosCache.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px">Sin usuarios registrados.</div>';
    return;
  }
  usuariosCache.forEach((u, i) => {
    const div = document.createElement('div'); div.className = 'usuario-item';
    div.innerHTML = `
      <input type="text" value="${u.correo}" placeholder="correo@gmail.com" data-idx="${i}" data-field="correo" />
      <input type="text" value="${u.nombre}" placeholder="Nombre" data-idx="${i}" data-field="nombre" />
      <select data-idx="${i}" data-field="rol">
        <option value="junior"    ${u.rol==='junior'   ?'selected':''}>Junior</option>
        <option value="senior"    ${u.rol==='senior'   ?'selected':''}>Senior</option>
        <option value="consultor" ${u.rol==='consultor'?'selected':''}>Consultor</option>
      </select>
      <label class="toggle-activo"><input type="checkbox" ${u.activo?'checked':''} data-idx="${i}" /> Activo</label>
      <button class="btn-remove" data-action="remove-usuario" data-idx="${i}">×</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll('input[type="text"], select').forEach(inp => {
    inp.addEventListener('input',  e => { usuariosCache[parseInt(e.target.dataset.idx)][e.target.dataset.field] = e.target.value; });
    inp.addEventListener('change', e => { usuariosCache[parseInt(e.target.dataset.idx)][e.target.dataset.field] = e.target.value; });
  });
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', e => { usuariosCache[parseInt(e.target.dataset.idx)].activo = e.target.checked; });
  });
}
window.removeUsuario = (i) => { usuariosCache.splice(i,1); renderUsuariosList(); };

// ══════════════════════════════════════════════════════════════
// DELEGATED EVENT LISTENER — handles ALL config buttons
// Attached to document so it works even when elements are hidden/recreated
// ══════════════════════════════════════════════════════════════
document.addEventListener('click', async function configClickHandler(e) {
  // ── Config nav tab switching ──
  const navBtn = e.target.closest('.config-nav-btn');
  if (navBtn) {
    document.querySelectorAll('.config-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.config-section').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    navBtn.classList.add('active');
    const sec = $(`config-section-${navBtn.dataset.section}`);
    if (sec) { sec.classList.remove('hidden'); sec.classList.add('active'); }
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  // ── Config: add items ──
  if (action === 'add-cliente') {
    state.config.clientes.push("Nuevo cliente"); buildClientesList(); return;
  }
  if (action === 'add-producto') {
    state.config.productos.push("Nuevo producto"); buildProductosList(); return;
  }
  if (action === 'add-tarea') {
    const allSecs = [...new Set([...SECCIONES_OPTS, ...state.config.tareas.map(t=>t.seccion)])];
    state.config.tareas.push({ seccion: allSecs[0], nombre: "Nueva tarea" });
    buildTareasList(); return;
  }
  if (action === 'add-competidor') {
    if (state.config.competidores.length >= 6) return showToast("Máximo 6 competidores", 'info');
    state.config.competidores.push({ nombre: "Nuevo competidor", productos: ["Producto 1"] });
    buildCompetidoresList(); return;
  }
  if (action === 'add-comp-prod') {
    const ci = parseInt(btn.dataset.ci);
    if (state.config.competidores[ci].productos.length >= 10) return showToast("Máximo 10 productos", 'info');
    state.config.competidores[ci].productos.push("Nuevo producto");
    buildCompetidoresList(); return;
  }
  if (action === 'add-usuario') {
    usuariosCache.push({ uid:'', correo:'', nombre:'', rol:'junior', activo: true });
    renderUsuariosList(); return;
  }

  // ── Config: remove items ──
  if (action === 'remove-config') {
    const type = btn.dataset.type; const idx = parseInt(btn.dataset.idx);
    state.config[type].splice(idx, 1);
    if (type === 'clientes')     buildClientesList();
    if (type === 'productos')    buildProductosList();
    if (type === 'tareas')       buildTareasList();
    if (type === 'competidores') buildCompetidoresList();
    return;
  }
  if (action === 'remove-comp-prod') {
    const ci = parseInt(btn.dataset.ci); const pi = parseInt(btn.dataset.pi);
    state.config.competidores[ci].productos.splice(pi, 1);
    buildCompetidoresList(); return;
  }
  if (action === 'remove-usuario') {
    usuariosCache.splice(parseInt(btn.dataset.idx), 1);
    renderUsuariosList(); return;
  }

  // ── Config: save ──
  const saveAndRefresh = async (msg, ...rebuilds) => {
    showLoading("Guardando...");
    try { await saveConfig(); hideLoading(); showToast(msg); rebuilds.forEach(fn => fn()); }
    catch(e) { hideLoading(); showToast("Error: "+e.message,'error'); }
  };
  if (action === 'save-clientes')     { await saveAndRefresh("Clientes guardados ✓", buildProtocoloTable, buildProductosTable, buildCompetidoresTable); return; }
  if (action === 'save-productos')    { await saveAndRefresh("Productos guardados ✓", buildProductosTable); return; }
  if (action === 'save-tareas')       { await saveAndRefresh("Tareas guardadas ✓", buildProtocoloTable); return; }
  if (action === 'save-competidores') { await saveAndRefresh("Competidores guardados ✓", buildCompetidoresTable); return; }
  if (action === 'save-all-config')   { await saveAndRefresh("Configuración guardada ✓", buildProtocoloTable, buildProductosTable, buildCompetidoresTable); return; }

  if (action === 'save-usuarios') {
    showLoading("Guardando usuarios...");
    try {
      const rows = [['uid','correo','nombre','rol','activo'], ...usuariosCache.map(u => [u.uid, u.correo, u.nombre, u.rol, u.activo ? 'TRUE' : 'FALSE'])];
      await sheetsClear("usuarios!A:E");
      await sheetsUpdate("usuarios!A1", rows);
      hideLoading(); showToast("Usuarios guardados ✓");
    } catch(e) { hideLoading(); showToast("Error: "+e.message,'error'); }
    return;
  }
});

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════
$("btn-export-excel").addEventListener('click', exportExcel);
$("btn-export-pdf").addEventListener('click',   exportPDF);

function exportExcel() {
  const sk = sessionKey();
  const { tareas, clientes, productos } = state.config;
  const wb = XLSX.utils.book_new();

  // Protocolo sheet
  const pData = [['Sección', 'Tarea', ...clientes]];
  tareas.forEach((t, ti) => {
    const key = `${sk}_${t.seccion}_${ti}`;
    const row = state.data[sk]?.protocolo?.[key] || [];
    pData.push([t.seccion, t.nombre, ...clientes.map((_,ci) => {
      const v = parseInt(row[ci]) || 0;
      return v === 1 ? '✓' : v === 2 ? '✗' : '';
    })]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pData), 'Protocolo');

  // Productos sheet
  const prData = [['Producto', ...clientes]];
  productos.forEach((p, pi) => {
    const cobRow = (state.data[sk]?.cobertura?.[`${sk}_cob_${pi}`] || []).map(v => parseInt(v)||0);
    const disRow = (state.data[sk]?.disponibilidad?.[`${sk}_dis_${pi}`] || []).map(v => parseInt(v)||0);
    prData.push([`[COB] ${p}`, ...clientes.map((_,ci) => cobRow[ci]===1?'✓':cobRow[ci]===2?'✗':'')]);
    prData.push([`[DIS] ${p}`, ...clientes.map((_,ci) => disRow[ci]===1?'✓':disRow[ci]===2?'✗':'')]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prData), 'Productos');

  XLSX.writeFile(wb, `NexoVentas_${sk}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast("Excel descargado ✓");
}

function exportPDF() {
  window.print();
  showToast("Usa Guardar como PDF en el diálogo de impresión");
}

// ══════════════════════════════════════════════════════════════
// SESSION LOG
// ══════════════════════════════════════════════════════════════
async function logSession(hoja) {
  try {
    const nowEST = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }) + ' EST';
    const device = navigator.userAgent.slice(0,80);
    const row = [[state.user?.email||'?', nowEST, state.dia, state.semana, hoja, device]];
    const existing = await sheetsGet("sesiones!A:F").catch(() => []);
    const nextRow = existing.length + 1;
    await sheetsUpdate(`sesiones!A${nextRow}`, row);
  } catch(e) { /* non-critical */ }
}


// ══════════════════════════════════════════════════════════════
// THEME TOGGLE
// ══════════════════════════════════════════════════════════════
window.toggleTheme = function() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('nv-theme', isLight ? 'light' : 'dark');
  // Rebuild charts so colors adapt (Chart.js doesn't live-update CSS vars)
  if (state.rol && state.rol !== 'junior') {
    setTimeout(() => buildCharts(), 50); // small delay so CSS vars settle
  }
};

// Apply saved theme immediately before render
(function() {
  if (localStorage.getItem('nv-theme') === 'light') {
    document.body.classList.add('light');
  }
})();

// Config nav is wired via delegated click handler below


// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
auth.onAuthStateChanged(async user => {
  if (user) {
    // Try to recover token from session
    try {
      const result = await auth.currentUser.getIdToken(true);
      // Token refreshed but we need the OAuth access token for Sheets
      // User must re-login to get access token — redirect to login
    } catch(e) {}
    // Access token is only available after fresh login
    // So always show login screen on refresh
  }
  showScreen('login');
  hideLoading();
});
