const API_BASE = "http://localhost:8000";
const modules=[
["core","⌂","Núcleo"],["ai","✧","SUPER AI"],["command","◈","Command Center"],["board","⚖","AI Board"],["video","▣","Video Studio"],["social","↗","Social Media"],["evolution","⟳","Evolution"],["security","⬡","Anti-Hack"],["memory","▤","Memoria"],["settings","⚙","Sistema"],["connections","⌘","Conexiones"]];
const agents=[["ChatGPT","Orquestador"],["Claude","Director creativo"],["Gemini","Investigador"],["DeepSeek","Ingeniero"],["Grok","Evaluador crítico"]];
let active="core",messages=[],tasks=[];
const $=s=>document.querySelector(s);
function nav(){ $("#nav").innerHTML=modules.map(([id,ic,n])=>`<button class="navitem ${active===id?"active":""}" data-id="${id}">${ic}　${n}</button>`).join("");document.querySelectorAll(".navitem").forEach(b=>b.onclick=()=>{active=b.dataset.id;render();$("#sidebar")?.classList.remove("open")})}
function card(title,body){return `<div class="card"><h3>${title}</h3>${body}</div>`}
function render(){
 nav();let m=modules.find(x=>x[0]===active);$("#pageTitle").textContent=m[2];let html="";
 if(active==="core"||active==="command"){
 html=`<div class="hero"><div><div class="eyebrow">00 / JARVIS CORE</div><h2>Intelligence at your command.</h2><div class="muted">Centro de control del ecosistema multiagente.</div></div><div class="reactor">✧</div></div><div class="grid">${card("AGENTES",`<div class="metric">05</div>`)}${card("TAREAS",`<div class="metric">${tasks.length}</div>`)}${card("MENSAJES",`<div class="metric">${messages.length}</div>`)}${card("SEGURIDAD",`<div class="metric" style="font-size:19px">ACTIVA*</div>`)}</div><h3 class="sectiontitle">AI TEAM</h3><div class="agents">${agents.map(a=>`<div class="agent"><b>${a[0]}</b><span class="tag">${a[1]}</span><p class="muted" style="font-size:11px">Proveedor configurable</p></div>`).join("")}</div><h3 class="sectiontitle">Tareas recientes</h3>${taskList()}`;
 }else if(active==="ai"){
 html=`<div class="card"><div class="eyebrow">MULTI-AGENT INTERFACE</div><h2>Habla con JARVIS</h2><p class="muted">Elige el proveedor que procesará tu solicitud.</p><div class="formrow"><select id="provider">${agents.map(a=>`<option value="${a[0].toLowerCase()}">${a[0]}</option>`).join("")}</select><textarea id="prompt" placeholder="Escribe tu objetivo o pregunta..."></textarea><button class="btn primary" id="send">Enviar solicitud ↗</button></div><div class="chatlog" id="chatlog">${messages.map(x=>`<div class="bubble user"><b>Tú</b><br>${escapeHtml(x.q)}</div><div class="bubble"><b>${x.p}</b><br>${escapeHtml(x.a)}</div>`).join("")}</div></div>`;
 }else if(active==="board"){
 html=`<div class="card"><h2>AI Board</h2><p class="muted">Panel para registrar propuestas y preparar votaciones.</p><div class="formrow"><input id="proposal" placeholder="Escribe una propuesta..."><button class="btn primary" id="addProposal">Crear propuesta</button></div><div id="proposalList" class="empty">No hay propuestas en esta sesión.</div></div>`;
 }else if(active==="video"){
 html=`<div class="hero"><div><div class="eyebrow">CREATIVE PRODUCTION</div><h2>AI Video Studio</h2><div class="muted">Ideas, guiones y paquetes de producción.</div></div><div class="reactor">▣</div></div><div class="grid">${["Generar idea","Escribir guion","Storyboard","Paquete Shorts"].map(x=>card(x,`<button class="btn action" data-task="${x}">Crear tarea</button>`)).join("")}</div><h3 class="sectiontitle">Cola de producción</h3>${taskList()}`;
 }else if(active==="social"){
 html=`<div class="grid">${card("TikTok",`<div class="pill warn">OAuth pendiente</div><p class="muted">Conector oficial por configurar.</p>`)}${card("YouTube",`<div class="pill warn">OAuth pendiente</div><p class="muted">Conector oficial por configurar.</p>`)}${card("Viral Score",`<div class="metric">—</div>`)}${card("Retención",`<div class="metric">—</div>`)}</div><p class="muted">Las métricas reales aparecerán después de autorizar las cuentas.</p>`;
 }else if(active==="evolution"||active==="security"){
 const items=active==="security"?["Auditar dependencias","Revisar configuración","Verificar backups","Consultar alertas"]:["Analizar rendimiento","Detectar errores","Proponer mejoras","Revisar dependencias"];
 html=`<div class="card"><h2>${m[2]}</h2><p class="muted">Herramientas de análisis y revisión. Las acciones críticas requieren aprobación humana.</p><div class="list">${items.map(x=>`<div class="listitem"><span>${x}</span><button class="btn action" data-task="${x}">Registrar</button></div>`).join("")}</div></div>`;
 }else if(active==="memory"){
 html=`<div class="card"><h2>Memoria de JARVIS</h2><p class="muted">Tareas registradas en esta sesión de navegador.</p>${taskList()}</div>`;
 }else if(active==="settings"){
 html=`<div class="card"><h2>Configuración del sistema</h2><p class="muted">Controles iniciales del espacio de trabajo.</p><div class="list">${agents.map(a=>`<div class="listitem"><span>${a[0]} · ${a[1]}</span><span class="pill">Configurable en backend</span></div>`).join("")}</div><p class="footer">Los permisos y la autonomía reales deben validarse en el servidor.</p></div>`;
 }else if(active==="connections"){
 html=`<div class="card"><h2>Conexiones API</h2><p class="muted">Estado consultado desde el backend. Las claves nunca se muestran en la web.</p><button class="btn" id="checkProviders">Comprobar conexiones</button><div id="providers" class="list" style="margin-top:15px"><div class="empty">Pulsa para consultar el backend.</div></div></div>`;
 }
 $("#content").innerHTML=html+`<div class="footer">JARVIS CORE 2.0 · Web MVP · *Estado visual, no auditoría certificada.</div>`;
 const send=$("#send");if(send)send.onclick=sendChat;
 const add=$("#addProposal");if(add)add.onclick=()=>{let v=$("#proposal").value.trim();if(v){tasks.unshift("Propuesta: "+v);$("#proposalList").className="list";$("#proposalList").innerHTML=taskList();$("#proposal").value=""}};
 document.querySelectorAll(".action").forEach(b=>b.onclick=async()=>{tasks.unshift(b.dataset.task);render()});
 const check=$("#checkProviders");if(check)check.onclick=loadProviders;
}
function taskList(){return tasks.length?`<div class="list">${tasks.map(t=>`<div class="listitem"><span>${escapeHtml(t)}</span><span class="pill">Registrada</span></div>`).join("")}</div>`:`<div class="empty">Todavía no hay tareas.</div>`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function sendChat(){let q=$("#prompt").value.trim(),p=$("#provider").value;if(!q)return;let b=$("#send");b.disabled=true;b.textContent="Procesando...";try{let r=await fetch(API_BASE+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:p,message:q})});let d=await r.json();if(!r.ok)throw new Error(d.detail||"Error de API");messages.unshift({q,p,a:d.answer})}catch(e){messages.unshift({q,p,a:"No se pudo conectar con el backend: "+e.message+". Comprueba que el servidor esté activo y que API_BASE apunte a él."})}render()}
async function loadProviders(){let box=$("#providers");box.innerHTML='<div class="empty">Consultando...</div>';try{let r=await fetch(API_BASE+"/api/providers");let d=await r.json();box.innerHTML=d.map(x=>`<div class="listitem"><b>${x.id}</b><span class="pill ${x.configured?"":"warn"}">${x.configured?"Clave configurada":"Falta API key"}</span></div>`).join("")}catch(e){box.innerHTML='<div class="empty">No se pudo conectar. Inicia el backend y configura API_BASE.</div>'}}
$("#menu").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
render();
