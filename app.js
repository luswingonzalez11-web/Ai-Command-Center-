
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
  ["connections", "⌘", "Conexiones"]
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
const mode = localStorage.getItem("jarvis_mode") || "individual";
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
      $("#sidebar")?.classList.remove("open");
    };
  });
  const studio = $("#studioNav");
  if (studio) studio.onclick = () => {
    markNotificationsRead("studio");
    document.querySelectorAll(".navitem").forEach(x => x.classList.remove("active"));
    studio.classList.add("active");
    $("#pageTitle").textContent = "AI Task & Video Studio";
    window.renderStudio?.();
    $("#sidebar")?.classList.remove("open");
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
              ${agentStates[a[2]] ? "ON" : "OFF"}
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

      <h3 class="sectiontitle">Agentes conectados</h3>
      ${agentPanel()}
      <p class="footer">Los interruptores se guardan en este navegador. No desconectan las API del servidor.</p>
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
                  ${a[0]} ${agentStates[a[2]] ? "" : "(OFF)"}
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

        <div class="chatlog" id="chatlog">
          ${messages.map(x => `
            <div class="bubble user"><b>Tú</b><br>${escapeHtml(x.q)}</div>
            ${x.results ? x.results.map(r => `
              <div class="bubble"><b>${escapeHtml(r.name)}</b><br>${escapeHtml(r.answer)}</div>
            `).join("") : ""}
            <div class="bubble"><b>${escapeHtml(x.p)}</b><br>${escapeHtml(x.a)}</div>
          `).join("")}
        </div>
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

  $("#content").innerHTML = html + `
    <div class="footer">JARVIS CORE 3.0 · Multi-Agent Control MVP</div>
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
    b.onclick = () => {
      tasks.unshift(b.dataset.task);
      notifySection(active, "Nueva actividad: " + b.dataset.task);
      render();
    };
  });

  const check = $("#checkProviders");
  if (check) check.onclick = loadProviders;
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

async function askAgent(provider, message) {
  const r = await fetch(API_BASE + "/api/chat", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({provider, message})
  });

  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Error de API");
  return d.answer || "Sin respuesta del proveedor.";
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

  try {
    if (selectedMode === "individual") {
      const provider = $("#provider").value;
      if (!agentStates[provider]) throw new Error("Ese agente está desactivado.");

      finalAnswer = await askAgent(provider, q);
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

      const responses = await Promise.allSettled(
        team.map(async a => ({
          name: a[0],
          id: a[2],
          answer: await askAgent(a[2], q)
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

      const usable = results.filter(r => !r.answer.startsWith("Error:"));
      if (!usable.length) throw new Error("Ningún agente pudo responder.");

      status.textContent = "ChatGPT está preparando la síntesis del equipo...";

      const report = usable.map(r =>
        `AGENTE: ${r.name}\nRESPUESTA:\n${r.answer}`
      ).join("\n\n----------------\n\n");

      finalAnswer = await askAgent(
        "openai",
        "Actúa como coordinador de JARVIS CORE. Compara las respuestas del equipo, identifica acuerdos, contradicciones y errores. Después entrega una conclusión clara y recomendaciones.\n\nSOLICITUD ORIGINAL:\n" +
        q +
        "\n\nRESPUESTAS DEL EQUIPO:\n" +
        report
      );

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

$("#menu").onclick = () => {
  document.querySelector(".sidebar").classList.toggle("open");
};

render();
