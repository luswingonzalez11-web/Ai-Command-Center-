
const API_BASE = "https://jarvis-core-wvls.onrender.com";

const modules = [
  ["core", "⌂", "Núcleo"],
  ["ai", "✧", "SUPER AI"],
  ["command", "◈", "Command Center"],
  ["board", "⚖", "AI Board"],
  ["video", "▣", "Video Studio"],
  ["social", "↗", "Social Media"],
  ["evolution", "⟳", "Evolution"],
  ["security", "⬡", "Anti-Hack"],
  ["memory", "▤", "Memoria"],
  ["settings", "⚙", "Sistema"],
  ["connections", "⌘", "Conexiones"],
  ["performance", "◷", "Rendimiento"]
];

const NOTIFICATION_KEY = "jarvis_notifications_v1";
let notifications = [];
try { notifications = JSON.parse(localStorage.getItem(NOTIFICATION_KEY)) || []; } catch { notifications = []; }

function saveNotifications() {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notifications.slice(0, 100)));
}
function notifySection(section, title) {
  notifications.unshift({id: Date.now() + Math.random(), section, title, createdAt: new Date().toISOString(), read: false});
  saveNotifications();
  nav();
}
function unreadCount(section) {
  return notifications.filter(n => n.section === section && !n.read).length;
}
function markNotificationsRead(section) {
  let changed = false;
  notifications.forEach(n => { if (n.section === section && !n.read) { n.read = true; changed = true; } });
  if (changed) saveNotifications();
}
window.jarvisNotify = notifySection;
window.jarvisMarkRead = markNotificationsRead;

const agents = [
  ["ChatGPT", "Orquestador", "openai"],
  ["Claude", "Director creativo", "claude"],
  ["Gemini", "Investigador", "gemini"],
  ["DeepSeek", "Ingeniero", "deepseek"],
  ["Grok", "Evaluador crítico", "grok"]
];

let active = "core";
let messages = [];
let tasks = [];
const BOARD_KEY = "jarvis_ai_board_v1";
let boardProposals = [];
try { boardProposals = JSON.parse(localStorage.getItem(BOARD_KEY)) || []; } catch { boardProposals = []; }
const BOARD_VOTERS = ["ChatGPT", "Claude", "Gemini", "Grok (temporal)"];
function saveBoard() { localStorage.setItem(BOARD_KEY, JSON.stringify(boardProposals)); }
function boardStatus(p) {
  const yes = Object.values(p.votes).filter(v => v === "approve").length;
  const no = Object.values(p.votes).filter(v => v === "reject").length;
  if (yes === 2 && no === 2) return "Empate · aprobación humana";
  if (yes >= 3) return "Aprobada por mayoría";
  if (no >= 3) return "Rechazada por mayoría";
  return "Votación en curso";
}
let mode = localStorage.getItem("jarvis_mode") || "individual";
let paused = localStorage.getItem("jarvis_paused") === "true";

let agentStates;
try {
  agentStates = JSON.parse(localStorage.getItem("jarvis_agents")) || {};
} catch {
  agentStates = {};
}

agents.forEach(a => {
  if (typeof agentStates[a[2]] !== "boolean") agentStates[a[2]] = true;
});

const $ = s => document.querySelector(s);

function closeMobileMenu() {
  $("#sidebar")?.classList.remove("open");
  $("#menuBackdrop")?.classList.remove("open");
  $("#menu")?.setAttribute("aria-expanded", "false");
}

function saveControls() {
  localStorage.setItem("jarvis_agents", JSON.stringify(agentStates));
  localStorage.setItem("jarvis_mode", mode);
  localStorage.setItem("jarvis_paused", String(paused));
}

function enabledAgents() {
  return agents.filter(a => agentStates[a[2]]);
}

function nav() {
  $("#nav").innerHTML = modules.map(([id, ic, n]) => {
    const count = unreadCount(id);
    return `<button class="navitem ${active === id ? "active" : ""}" data-id="${id}">${ic}　${n}${count ? `<span class="navbadge">${count > 99 ? "99+" : count}</span>` : ""}</button>`;
  }).join("") + `<button class="navitem" id="studioNav">◉　AI Task & Video Studio${unreadCount("studio") ? `<span class="navbadge">${unreadCount("studio")}</span>` : ""}</button>`;

  document.querySelectorAll(".navitem[data-id]").forEach(b => {
    b.onclick = () => {
      active = b.dataset.id;
      markNotificationsRead(active);
      render();
      closeMobileMenu();
    };
  });
  const studio = $("#studioNav");
  if (studio) studio.onclick = () => {
    markNotificationsRead("studio");
    document.querySelectorAll(".navitem").forEach(x => x.classList.remove("active"));
    studio.classList.add("active");
    $("#pageTitle").textContent = "AI Task & Video Studio";
    window.renderStudio?.();
    closeMobileMenu();
  };
}

function card(title, body) {
  return `<div class="card"><h3>${title}</h3>${body}</div>`;
}

function agentPanel() {
  return `
    <div class="agents">
      ${agents.map(a => `
        <div class="agent">
          <div class="row">
            <b>${a[0]}</b>
            <span class="pill ${agentStates[a[2]] ? "" : "warn"}">
              ${agentStates[a[2]] ? "HABILITADO" : "DESACTIVADO"}
            </span>
          </div>
          <span class="tag">${a[1]}</span>
          <p class="muted" style="font-size:11px">ID: ${a[2]}</p>
          <button class="btn agent-toggle" data-agent="${a[2]}">
            ${agentStates[a[2]] ? "Desactivar" : "Activar"}
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function controlPanel() {
  return `
    <div class="card">
      <div class="row">
        <div>
          <h2 style="margin:0">AI Team Control</h2>
          <p class="muted">Control de los cinco agentes.</p>
        </div>
        <span class="pill ${paused ? "warn" : ""}">
          ${paused ? "PAUSADO" : "ACTIVO"}
        </span>
      </div>

      <div class="formrow">
        <label for="modeSelect">Modo de operación</label>
        <select id="modeSelect">
          <option value="individual" ${mode === "individual" ? "selected" : ""}>Individual Mode</option>
          <option value="team" ${mode === "team" ? "selected" : ""}>TEAM MODE</option>
        </select>
        <button class="btn ${paused ? "primary" : ""}" id="pauseToggle">
          ${paused ? "▶ Reanudar solicitudes" : "Ⅱ Pausar nuevas solicitudes"}
        </button>
      </div>

      <h3 class="sectiontitle">Agentes habilitados</h3>
      ${agentPanel()}
      <p class="footer">Habilitar un agente no significa que su API esté conectada. Los interruptores se guardan en este navegador y no desconectan las API del servidor.</p>
    </div>
  `;
}

function render() {
  nav();

  const m = modules.find(x => x[0] === active);
  $("#pageTitle").textContent = m[2];

  let html = "";

  if (active === "core" || active === "command") {
    html = `
      <div class="hero">
        <div>
          <div class="eyebrow">00 / JARVIS CORE</div>
          <h2>Intelligence at your command.</h2>
          <div class="muted">Centro de control del ecosistema multiagente.</div>
        </div>
        <div class="reactor">✧</div>
      </div>

      <div class="grid">
        ${card("AGENTES ACTIVOS", `<div class="metric">${enabledAgents().length}/5</div>`)}
        ${card("TAREAS", `<div class="metric">${tasks.length}</div>`)}
        ${card("MENSAJES", `<div class="metric">${messages.length}</div>`)}
        ${card("SISTEMA", `<div class="metric" style="font-size:19px">${paused ? "PAUSADO" : "ACTIVO"}</div>`)}
      </div>

      <h3 class="sectiontitle">AI TEAM CONTROL</h3>
      ${controlPanel()}

      <h3 class="sectiontitle">Tareas recientes</h3>
      ${taskList()}
    `;

  } else if (active === "ai") {
    html = `
      <div class="card">
        <div class="eyebrow">MULTI-AGENT INTERFACE</div>
        <h2>Habla con JARVIS</h2>
        <p class="muted">Selecciona una IA o activa TEAM MODE.</p>

        <div class="formrow">
          <label for="chatMode">Modo</label>
          <select id="chatMode">
            <option value="individual" ${mode === "individual" ? "selected" : ""}>Individual Mode</option>
            <option value="team" ${mode === "team" ? "selected" : ""}>TEAM MODE</option>
          </select>

          <div id="individualPicker" class="${mode === "team" ? "hidden" : ""}">
            <label for="provider">Proveedor</label>
            <select id="provider">
              ${agents.map(a => `
                <option value="${a[2]}" ${agentStates[a[2]] ? "" : "disabled"}>
                  ${a[0]} ${agentStates[a[2]] ? "" : "(DESACTIVADO)"}
                </option>
              `).join("")}
            </select>
          </div>

          <textarea id="prompt" placeholder="Escribe tu objetivo o pregunta..."></textarea>
          <button class="btn primary" id="send" ${paused ? "disabled" : ""}>
            ${paused ? "Sistema pausado" : "Enviar solicitud ↗"}
          </button>
          <p class="muted" id="chatStatus">${paused ? "Reanuda el sistema para enviar solicitudes." : "Listo para recibir instrucciones."}</p>
        </div>

        <section class="chat-thread" id="chatlog" aria-label="Conversación con las IA">
          ${messages.slice().reverse().map(x => `
            <article class="chat-turn">
              <div class="chat-message chat-user">
                <div class="chat-author">TÚ</div>
                <div class="chat-copy">${escapeHtml(x.q)}</div>
              </div>
              ${x.results ? x.results.map(r => `
                <div class="chat-message chat-agent">
                  <div class="chat-author"><span class="agent-mark">${escapeHtml(r.name)}</span></div>
                  <div class="chat-copy">${escapeHtml(r.answer)}</div>
                </div>
              `).join("") : ""}
              <div class="chat-message chat-agent chat-final">
                <div class="chat-author"><span class="agent-mark">${escapeHtml(x.p)}</span></div>
                <div class="chat-copy">${escapeHtml(x.a)}</div>
              </div>
            </article>
          `).join("")}
        </section>
      </div>
    `;

  } else if (active === "board") {
    html = `
      <div class="card">
        <div class="eyebrow">GOVERNANCE / HUMAN OVERSIGHT</div>
        <h2>AI Board</h2>
        <p class="muted">Cuatro asientos: ChatGPT, Claude, Gemini y Grok temporal. Se requieren 3 de 4 votos para una decisión automática; un empate 2–2 queda en manos del usuario.</p>
        <div class="formrow">
          <input id="proposal" maxlength="240" placeholder="Escribe una propuesta para votar...">
          <button class="btn primary" id="addProposal">Crear votación</button>
        </div>
      </div>
      <h3 class="sectiontitle">Propuestas y votaciones</h3>
      <div class="list">
        ${boardProposals.length ? boardProposals.map(p => {
          const yes = Object.values(p.votes).filter(v => v === "approve").length;
          const no = Object.values(p.votes).filter(v => v === "reject").length;
          const status = boardStatus(p);
          return `<div class="card">
            <div class="row"><b>${escapeHtml(p.title)}</b><span class="pill">${status}</span></div>
            <p class="muted">A favor: ${yes}/4 · En contra: ${no}/4 · Sin votar: ${4-yes-no}/4</p>
            <div class="grid">${BOARD_VOTERS.map((voter,i) => `
              <label class="listitem"><span>${voter}</span>
                <select data-board-vote="${p.id}" data-voter="${i}">
                  <option value="">Sin voto</option>
                  <option value="approve" ${p.votes[i]==="approve"?"selected":""}>A favor</option>
                  <option value="reject" ${p.votes[i]==="reject"?"selected":""}>En contra</option>
                  <option value="abstain" ${p.votes[i]==="abstain"?"selected":""}>Abstención</option>
                </select>
              </label>`).join("")}</div>
            ${yes===2 && no===2 && !p.humanDecision ? `<div class="row"><button class="btn primary" data-board-human="${p.id}" data-decision="approve">Usuario: aprobar empate</button><button class="btn" data-board-human="${p.id}" data-decision="reject">Usuario: rechazar empate</button></div>` : ""}
            ${p.humanDecision ? `<p class="footer">Decisión final del usuario: ${p.humanDecision==="approve"?"Aprobada":"Rechazada"}</p>` : ""}
          </div>`;
        }).join("") : '<div class="empty">Todavía no hay propuestas.</div>'}
      </div>
    `;

  } else if (active === "video") {
    html = `
      <div class="hero">
        <div>
          <div class="eyebrow">CREATIVE PRODUCTION</div>
          <h2>AI Video Studio</h2>
          <div class="muted">Ideas, guiones y paquetes de producción.</div>
        </div>
        <div class="reactor">▣</div>
      </div>
      <div class="grid">
        ${["Generar idea", "Escribir guion", "Storyboard", "Paquete Shorts"]
          .map(x => card(x, `<button class="btn action" data-task="${x}">Crear tarea</button>`))
          .join("")}
      </div>
      <h3 class="sectiontitle">Cola de producción</h3>
      ${taskList()}
    `;

  } else if (active === "social") {
    html = `
      <div class="grid">
        ${card("TikTok", `<div class="pill warn">OAuth pendiente</div><p class="muted">Conector oficial por configurar.</p>`)}
        ${card("YouTube", `<div class="pill warn">OAuth pendiente</div><p class="muted">Conector oficial por configurar.</p>`)}
        ${card("Viral Score", `<div class="metric">—</div>`)}
        ${card("Retención", `<div class="metric">—</div>`)}
      </div>
    `;

  } else if (active === "evolution" || active === "security") {
    const items = active === "security"
      ? ["Auditar dependencias", "Revisar configuración", "Verificar backups", "Consultar alertas"]
      : ["Analizar rendimiento", "Detectar errores", "Proponer mejoras", "Revisar dependencias"];

    html = `
      <div class="card">
        <h2>${m[2]}</h2>
        <p class="muted">Herramientas de análisis. Las acciones críticas requieren aprobación humana.</p>
        <div class="list">
          ${items.map(x => `
            <div class="listitem">
              <span>${x}</span>
              <button class="btn action" data-task="${x}">Registrar</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;

  } else if (active === "memory") {
    html = `
      <div class="card">
        <h2>Memoria de JARVIS</h2>
        <p class="muted">Tareas registradas en esta sesión.</p>
        ${taskList()}
      </div>
    `;

  } else if (active === "performance") {
    html = '<div class="card"><div class="row"><div><h2>AI Performance & Usage</h2><p class="muted">Latencia, tokens y actividad por agente.</p></div><button class="btn" id="refreshUsage">Actualizar</button></div><div id="usageDashboard"><div class="empty">Cargando métricas...</div></div></div>';
  } else if (active === "settings") {
    html = `
      ${controlPanel()}
      <div class="card">
        <h2>Developer Access</h2>
        <p class="muted">Permisos previstos para ChatGPT y Claude.</p>
        <div class="list">
          <div class="listitem"><b>ChatGPT</b><span class="pill">Orquestador / propuestas</span></div>
          <div class="listitem"><b>Claude</b><span class="pill">Desarrollo / propuestas</span></div>
          <div class="listitem"><b>Gemini, DeepSeek y Grok</b><span class="pill warn">Solo análisis</span></div>
        </div>
        <p class="footer">Developer Access todavía requiere conexión autenticada con el backend. Esta pantalla no concede permisos de servidor.</p>
      </div>
    `;

  } else if (active === "connections") {
    html = `
      <div class="card">
        <h2>Conexiones API</h2>
        <p class="muted">Las claves nunca se muestran en la web.</p>
        <button class="btn" id="checkProviders">Comprobar conexiones</button>
        <div id="providers" class="list" style="margin-top:15px">
          <div class="empty">Pulsa para consultar el backend.</div>
        </div>
      </div>
    `;
  }

  const moduleDescriptions = {
    core: "Vista general del núcleo y estado operativo del ecosistema.",
    ai: "Interfaz de inteligencia multiagente · comunicación y síntesis.",
    command: "Orquestación central · controla agentes, modos y misiones.",
    board: "Gobernanza de IA · propuestas, votaciones y supervisión humana.",
    video: "Producción creativa · organiza ideas, guiones y entregables.",
    social: "Centro de distribución · conexiones oficiales y métricas sociales.",
    evolution: "Mejora continua · análisis técnico y propuestas de evolución.",
    security: "Defensa del sistema · auditoría, alertas y controles de seguridad.",
    memory: "Registro operativo local · actividad y elementos de trabajo.",
    settings: "Configuración del entorno · permisos y comportamiento del equipo.",
    connections: "Estado de proveedores · diagnóstico de conectividad API.",
    performance: "Observabilidad · latencia, consumo de tokens y actividad por agente."
  };
  const moduleIndex = String(modules.findIndex(x => x[0] === active) + 1).padStart(2, "0");
  const intro = `
    <div class="module-intro">
      <div><div class="module-code">JARVIS CORE / MODULE ${moduleIndex}</div>
        <h2>${m[2]}</h2><p>${moduleDescriptions[active] || "Subsistema JARVIS CORE."}</p>
      </div>
      <div class="module-signal"><i></i> INTERFACE READY</div>
    </div>`;
  $("#content").innerHTML = intro + html + `
    <div class="footer">JARVIS CORE · MULTI-AGENT INTELLIGENCE SYSTEM</div>
  `;

  const send = $("#send");
  if (send) send.onclick = sendChat;

  const chatMode = $("#chatMode");
  if (chatMode) chatMode.onchange = () => {
    mode = chatMode.value;
    saveControls();
    render();
  };

  const modeSelect = $("#modeSelect");
  if (modeSelect) modeSelect.onchange = () => {
    mode = modeSelect.value;
    saveControls();
    render();
  };

  const pauseButton = $("#pauseToggle");
  if (pauseButton) pauseButton.onclick = () => {
    paused = !paused;
    saveControls();
    render();
  };

  document.querySelectorAll(".agent-toggle").forEach(b => {
    b.onclick = () => {
      const id = b.dataset.agent;
      agentStates[id] = !agentStates[id];
      saveControls();
      render();
    };
  });

  const add = $("#addProposal");
  if (add) add.onclick = () => {
    const v = $("#proposal").value.trim();
    if (v) {
      boardProposals.unshift({id: Date.now(), title: v, votes: {}, humanDecision: null, createdAt: new Date().toISOString()});
      saveBoard();
      notifySection("board", "Nueva votación: " + v);
      render();
    }
  };
  document.querySelectorAll("[data-board-vote]").forEach(control => {
    control.onchange = () => {
      const proposal = boardProposals.find(p => String(p.id) === control.dataset.boardVote);
      if (!proposal || proposal.humanDecision) return;
      if (control.value) proposal.votes[control.dataset.voter] = control.value;
      else delete proposal.votes[control.dataset.voter];
      saveBoard();
      render();
    };
  });
  document.querySelectorAll("[data-board-human]").forEach(button => {
    button.onclick = () => {
      const proposal = boardProposals.find(p => String(p.id) === button.dataset.boardHuman);
      if (!proposal || boardStatus(proposal) !== "Empate · aprobación humana") return;
      proposal.humanDecision = button.dataset.decision;
      saveBoard();
      notifySection("board", "Decisión humana registrada: " + proposal.title);
      render();
    };
  });

  document.querySelectorAll(".action").forEach(b => {
    b.onclick = () => executeTask(b.dataset.task, b);
  });

  const check = $("#checkProviders");
  if (check) check.onclick = loadProviders;
  const refreshUsage = $("#refreshUsage");
  if (refreshUsage) refreshUsage.onclick = loadUsageMetrics;
  if (active === "performance") loadUsageMetrics();
}

function taskList() {
  return tasks.length
    ? `<div class="list">
        ${tasks.map(t => `
          <div class="listitem">
            <span>${escapeHtml(t)}</span>
            <span class="pill">Registrada</span>
          </div>
        `).join("")}
      </div>`
    : `<div class="empty">Todavía no hay tareas.</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

async function executeTask(task, button) {
  if (paused) { notifySection(active, "Sistema pausado: no se envió " + task); return; }
  const provider = agentStates.openai ? "openai" : (enabledAgents()[0]?.[2] || null);
  if (!provider) { alert("No hay agentes habilitados. Activa al menos uno en AI Team Control."); return; }
  const originalLabel = button.textContent; button.disabled = true; button.textContent = 'JARVIS trabajando...';
  const taskId = "task-" + Date.now();
  const isVideo = /video|mp4|short|reel|tiktok|youtube|historia|episodio|storyboard|guion|viral|archivo 09/i.test(task);
  try {
    if (isVideo) {
      const produced = await produceVideo(task, provider, taskId);
      progress.stop();

  messages.unshift({q:"Propuesta de video: "+task,p:"JARVIS · Video Studio",a:"MP4 generado y guardado en AI Task & Video Studio. "+produced.video.scenes+" escenas · "+produced.video.duration_seconds+" segundos.",results:[]});
      notifySection("video", "MP4 generado: " + produced.title); active = "ai"; render(); return;
    }
    const response = await askAgent(provider, "Atiende esta tarea del AI Command Center. Usa el contexto de sus módulos y entrega un resultado concreto. No pidas contexto que no sea imprescindible. No afirmes acciones externas no realizadas.\n\nTAREA: " + task, {task_id:taskId,request_type:"task"});
    const agentName = agents.find(a=>a[2]===provider)?.[0] || provider;
    tasks.unshift(task + " · respuesta recibida"); messages.unshift({q:"Nueva tarea: "+task,p:agentName,a:response.answer||"Sin respuesta del proveedor.",results:[]});
    notifySection("ai","Respuesta de "+agentName+" para: "+task); active="ai"; render();
  } catch(e) { button.disabled=false; button.textContent=originalLabel; notifySection(active,e.message); alert('No se pudo completar la tarea: '+e.message); }
}

async function produceVideo(prompt, provider="openai", taskId=null) {
  const r = await fetch(API_BASE + "/api/video/produce", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({prompt, provider, task_id: taskId})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || "No se pudo generar el MP4.");
  const video = data.video || data;
  if (!video.video_id || !video.filename || !video.library_url) {
    throw new Error("El servidor terminó la solicitud, pero no confirmó el registro del MP4 en la biblioteca.");
  }
  // Do not report completion until the library endpoint can see the saved video.
  const libraryResponse = await fetch(API_BASE + "/api/studio/videos");
  if (!libraryResponse.ok) throw new Error("El MP4 se creó, pero no se pudo verificar la biblioteca. Actualiza AI Task & Video Studio.");
  const library = await libraryResponse.json();
  const saved = Array.isArray(library) && library.some(item => String(item.id) === String(video.video_id));
  if (!saved) throw new Error("El MP4 no aparece todavía en la biblioteca. No se marcará como terminado.");
  return {...data, video, title: data.title || video.title, script: data.script || "", status: data.status || video.status};
}


/* Shared progress indicator: indeterminate until the server exposes real progress. */
window.JarvisProgress = {
  start(anchor, label = "Procesando solicitud...") {
    if (!anchor) return {update() {}, stop() {}};
    anchor.parentElement?.querySelector(".jarvis-progress")?.remove();
    const panel = document.createElement("div");
    panel.className = "jarvis-progress";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = '<div class="jarvis-progress-top"><span class="jarvis-progress-label"></span><span class="jarvis-progress-time">00:00</span></div><div class="jarvis-progress-track"><span></span></div><div class="jarvis-progress-hint">El proceso sigue activo. El tiempo depende del proveedor y del trabajo solicitado.</div>';
    anchor.insertAdjacentElement("afterend", panel);
    const labelNode = panel.querySelector(".jarvis-progress-label");
    const timeNode = panel.querySelector(".jarvis-progress-time");
    const hintNode = panel.querySelector(".jarvis-progress-hint");
    const started = Date.now();
    labelNode.textContent = label;
    const tick = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      timeNode.textContent = String(Math.floor(seconds / 60)).padStart(2,"0") + ":" + String(seconds % 60).padStart(2,"0");
      if (seconds >= 60) hintNode.textContent = "Está tardando más de lo habitual, pero la solicitud todavía está en curso. No cierres esta pantalla.";
    };
    tick();
    const timer = setInterval(tick, 1000);
    return {
      update(next) { if (labelNode.isConnected) labelNode.textContent = next; },
      stop() { clearInterval(timer); panel.remove(); }
    };
  }
};

async function askAgent(provider, message, tracking = {}) {
  const r = await fetch(API_BASE + "/api/chat", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({provider, message, ...tracking})
  });

  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Error de API");
  return d;
}

async function sendChat() {
  if (paused) return;

  const q = $("#prompt").value.trim();
  if (!q) return;

  const selectedMode = $("#chatMode").value;
  const send = $("#send");
  const status = $("#chatStatus");

  let results = [];
  let finalAnswer = "";
  let finalName = "";

  send.disabled = true;
  send.textContent = "Procesando...";
  status.textContent = "JARVIS está trabajando...";
  const progress = window.JarvisProgress.start(status, "Preparando solicitud...");

  try {
    const videoRequest = /\b(crea|crear|genera|generar|produce|producir|haz|hazme|quiero|necesito|prepara|prep[aá]rame)\b.{0,100}\b(video|mp4|short|reel|episodio)\b|\b(video|mp4|short|reel)\b.{0,100}\b(crea|genera|produce|haz|prepara)\b/i.test(q);
    if (videoRequest) {
      const provider = selectedMode === "individual" ? $("#provider").value : "openai";
      if (!agentStates[provider]) throw new Error("Activa el agente seleccionado para producir el video.");
      status.textContent = "Generando guion y renderizando el MP4...";
      progress.update("Generando guion y renderizando video...");
      const produced = await produceVideo(q, provider);
      const video = produced.video;
      finalAnswer = "MP4 generado y verificado en la biblioteca de AI Task & Video Studio.\n\n" +
        "Título: " + (produced.title || video.title) + "\nEscenas: " + video.scenes +
        "\nDuración: " + video.duration_seconds + " segundos." +
        "\nEstado: " + video.status + "\n\n" +
        "Abrir video: " + API_BASE + video.library_url + "\n" +
        "Descargar MP4: " + API_BASE + video.download_url;
      finalName = "AI Video Studio";
    } else if (selectedMode === "individual") {
      const provider = $("#provider").value;
      if (!agentStates[provider]) throw new Error("Ese agente está desactivado.");

      progress.update("Conectando con " + (agents.find(a => a[2] === provider)?.[0] || provider) + "...");
      const response = await askAgent(provider, q, {conversation_id: "chat-" + Date.now(), request_type: "chat"});
      finalAnswer = response.answer || "Sin respuesta del proveedor.";
      finalName = agents.find(a => a[2] === provider)?.[0] || provider;

    } else {
      const team = enabledAgents();
      if (team.length < 2) {
        throw new Error("Activa al menos dos agentes para TEAM MODE.");
      }

      if (!agentStates.openai) {
        throw new Error("Activa ChatGPT para que coordine y sintetice el equipo.");
      }

      status.textContent = `Consultando a ${team.length} agentes...`;
      progress.update("Consultando a " + team.length + " agentes en paralelo...");
      const teamConversationId = "team-" + Date.now();

      const responses = await Promise.allSettled(
        team.map(async a => ({
          name: a[0],
          id: a[2],
          response: await askAgent(a[2], q, {conversation_id: teamConversationId, request_type: "team"})
        }))
      );

      results = responses.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return {
          name: team[i][0],
          id: team[i][2],
          answer: "Error: " + r.reason.message
        };
      });

      results = results.map(r => r.response ? {...r, answer: r.response.answer || "Sin respuesta.", metrics: r.response.metrics} : r);
      const usable = results.filter(r => !r.answer.startsWith("Error:"));
      if (!usable.length) throw new Error("Ningún agente pudo responder.");

      status.textContent = "ChatGPT está preparando la síntesis del equipo...";
      progress.update("ChatGPT está preparando la síntesis del equipo...");

      const report = usable.map(r =>
        `AGENTE: ${r.name}\nRESPUESTA:\n${r.answer}`
      ).join("\n\n----------------\n\n");

      const synthesis = await askAgent(
        "openai",
        "Actúa como coordinador de JARVIS CORE. Compara las respuestas del equipo, identifica acuerdos, contradicciones y errores. Después entrega una conclusión clara y recomendaciones.\n\nSOLICITUD ORIGINAL:\n" +
        q +
        "\n\nRESPUESTAS DEL EQUIPO:\n" +
        report,
        {conversation_id: teamConversationId, request_type: "team_synthesis"}
      );

      finalAnswer = synthesis.answer || "Sin síntesis del equipo.";
      finalName = "ChatGPT · Síntesis del equipo";
    }

  } catch (e) {
    finalAnswer = "Error: " + e.message;
    finalName = "JARVIS CORE";
  }

  messages.unshift({
    q,
    p: finalName,
    a: finalAnswer,
    results
  });
  notifySection("ai", "Nueva respuesta de " + finalName);

  render();

  const newStatus = $("#chatStatus");
  if (newStatus) newStatus.textContent = "Solicitud finalizada.";
}

async function loadProviders() {
  const box = $("#providers");
  box.innerHTML = '<div class="empty">Consultando...</div>';

  try {
    const r = await fetch(API_BASE + "/api/providers");
    if (!r.ok) throw new Error("Error HTTP " + r.status);

    const d = await r.json();

    box.innerHTML = d.map(x => {
      const name = agents.find(a => a[2] === x.id)?.[0] || x.id;
      return `
        <div class="listitem">
          <b>${escapeHtml(name)}</b>
          <span class="pill ${x.configured ? "" : "warn"}">
            ${x.configured ? "Clave configurada" : "Falta API key"}
          </span>
        </div>
      `;
    }).join("");

  } catch (e) {
    box.innerHTML = `<div class="empty">No se pudo conectar: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadUsageMetrics() {
  const box = $("#usageDashboard");
  if (!box) return;
  box.innerHTML = '<div class="empty">Consultando métricas...</div>';
  try {
    const r = await fetch(API_BASE + "/api/usage/summary");
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "No se pudieron cargar las métricas.");
    const t = d.totals;
    const fmt = n => n == null ? "—" : Number(n).toLocaleString("es-US");
    let html = '<div class="usage-grid">' +
      '<div class="usage-stat"><small>Latencia promedio</small><strong>' + (t.average_latency_ms == null ? "—" : (t.average_latency_ms/1000).toFixed(2)+" s") + '</strong></div>' +
      '<div class="usage-stat"><small>Tokens registrados</small><strong>' + fmt(t.tokens) + '</strong><span>Entrada ' + fmt(t.input_tokens) + ' · Salida ' + fmt(t.output_tokens) + '</span></div>' +
      '<div class="usage-stat"><small>Solicitudes</small><strong>' + fmt(t.requests) + '</strong><span>' + fmt(t.successful) + ' correctas · ' + fmt(t.failed) + ' fallidas</span></div>' +
      '<div class="usage-stat"><small>Cobertura de tokens</small><strong>' + (t.requests ? Math.round(t.token_records/t.requests*100) : 0) + '%</strong><span>Reportados por proveedor</span></div></div>' +
      '<h3 class="sectiontitle">Rendimiento por agente</h3><div class="list">';
    html += d.by_provider.length ? d.by_provider.map(x => '<div class="listitem"><b>' + escapeHtml(x.provider) + '</b><span>' + fmt(x.average_latency_ms) + ' ms · ' + fmt(x.tokens) + ' tokens · ' + x.requests + ' solicitudes</span></div>').join("") : '<div class="empty">Todavía no hay solicitudes registradas.</div>';
    html += '</div><h3 class="sectiontitle">Actividad reciente</h3><div class="list">';
    html += d.recent.length ? d.recent.slice(0,20).map(x => '<div class="listitem"><span><b>' + escapeHtml(x.provider) + '</b> · ' + escapeHtml(x.model) + '<small class="muted" style="display:block">' + new Date(x.created_at).toLocaleString() + '</small></span><span>' + fmt(x.latency_ms) + ' ms · ' + (x.total_tokens == null ? 'tokens N/D' : fmt(x.total_tokens)+' tokens') + '</span></div>').join("") : '<div class="empty">Envía un chat o tarea para empezar a medir.</div>';
    html += '</div><p class="footer">Ventana: últimas 500 solicitudes. Costos no estimados hasta configurar tarifas verificadas por modelo. Los tokens no disponibles se marcan como N/D.</p>';
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<div class="empty">' + escapeHtml(e.message) + '</div>';
  }
}

$("#menu").onclick = () => {
  const opening = !$("#sidebar").classList.contains("open");
  $("#sidebar").classList.toggle("open", opening);
  $("#menuBackdrop").classList.toggle("open", opening);
  $("#menu").setAttribute("aria-expanded", String(opening));
};
$("#closeMenu").onclick = closeMobileMenu;
$("#menuBackdrop").onclick = closeMobileMenu;
document.addEventListener("keydown", event => { if (event.key === "Escape") closeMobileMenu(); });

render();
