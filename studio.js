(() => {
  const API = "https://jarvis-core-wvls.onrender.com";
  const notify = (label) => window.jarvisNotify?.("studio", label);
  const nav = document.querySelector("#nav");
  if (!nav) return;
  const button = document.createElement("button");
  button.className = "navitem";
  button.textContent = "◉　AI Task & Video Studio";
  button.addEventListener("click", () => {
    document.querySelectorAll(".navitem").forEach(x => x.classList.remove("active"));
    button.classList.add("active");
    document.querySelector("#pageTitle").textContent = "AI Task & Video Studio";
    renderStudio();
  });
  nav.appendChild(button);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const duration = n => n >= 60 ? Math.floor(n/60)+" h "+(n%60 ? n%60+" min" : "") : n+" min";
  const statusName = s => ({queued:"Pendiente",in_progress:"Trabajando",completed:"Completada",review:"En revisión",approved:"Aprobado",rejected:"Rechazado",ready_to_publish:"Listo para publicar"}[s] || s);

  async function request(path, options={}) {
    const r = await fetch(API + path, options);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || "Error del servidor ("+r.status+")");
    return data;
  }

  window.renderStudio = async function() {
    const root = document.querySelector("#content");
    root.innerHTML = `
      <div class="hero"><div><div class="eyebrow">AUTONOMOUS WORKSPACE</div><h2>AI Task Manager</h2><div class="muted">Planifica, estima y lanza trabajos cuando tú decidas.</div></div><div class="reactor">◉</div></div>
      <div class="card" style="margin-top:16px">
        <h3>Nueva tarea</h3>
        <div class="formrow"><input id="stTitle" maxlength="180" placeholder="Ej. Mejorar el panel de agentes"><textarea id="stDesc" placeholder="Describe qué quieres conseguir..."></textarea><button class="btn primary" id="stCreate">Calcular tiempo y guardar</button></div>
        <p class="muted" id="stMessage">Las estimaciones son aproximadas. Las tareas no ejecutan cambios de código automáticamente.</p>
      </div>
      <h3 class="sectiontitle">Trabajos y propuestas</h3><div id="stTasks" class="list"><div class="empty">Cargando tareas...</div></div>
      <div class="hero" style="margin-top:24px"><div><div class="eyebrow">CREATIVE PRODUCTION</div><h2>Claude Video Studio</h2><div class="muted">Biblioteca privada de videos cargados al servidor.</div></div><div class="reactor">▣</div></div>
      <div class="card" style="margin-top:16px"><h3>Subir video</h3><div class="formrow"><input id="svTitle" maxlength="180" placeholder="Título del video"><textarea id="svDesc" placeholder="Descripción (opcional)"></textarea><input id="svFile" type="file" accept="video/mp4,video/webm,video/quicktime"><button class="btn primary" id="svUpload">Guardar en biblioteca</button></div><p class="muted" id="svMessage">MP4, WebM o MOV · máximo 250 MB. El archivo se almacena en el disco del servidor.</p></div>
      <div class="hero" style="margin-top:24px"><div><div class="eyebrow">SCRIPT TO VIDEO</div><h2>Generador MP4</h2><div class="muted">Convierte un guion en un storyboard vertical animado.</div></div><div class="reactor">▶</div></div>
      <div class="card" style="margin-top:16px">
        <h3>Crear video desde un guion</h3>
        <div class="formrow">
          <input id="vrTitle" maxlength="120" placeholder="Título del video">
          <textarea id="vrScript" maxlength="12000" rows="7" placeholder="Escribe cada escena en una línea..."></textarea>
          <label class="muted">Duración por escena</label>
          <select id="vrSeconds"><option value="2">2 segundos</option><option value="4" selected>4 segundos</option><option value="6">6 segundos</option><option value="8">8 segundos</option></select>
          <label class="muted"><input id="vrVoice" type="checkbox"> Añadir narración automática en español</label>
          <button class="btn primary" id="vrCreate">Generar MP4</button>
        </div>
        <p class="muted" id="vrMessage">La primera versión genera escenas gráficas animadas, no personajes 3D ni video cinematográfico.</p>
        <div id="vrResult"></div>
      </div>
      <div class="hero" style="margin-top:24px"><div><div class="eyebrow">CLAUDE 2D ANIMATION</div><h2>Animación desde una descripción</h2><div class="muted">Claude dibuja escenas 2D originales y JARVIS las convierte en MP4 vertical.</div></div><div class="reactor">✦</div></div>
      <div class="card" style="margin-top:16px">
        <h3>Describe lo que quieres ver</h3>
        <div class="formrow">
          <input id="a2dTitle" maxlength="120" placeholder="Título (ej. ARCHIVO 09 — La señal)">
          <textarea id="a2dPrompt" maxlength="6000" rows="6" placeholder="Ej. Un soldado entra en un laboratorio abandonado. Una luz roja parpadea y una silueta aparece al fondo..."></textarea>
          <label class="muted">Duración por escena</label>
          <select id="a2dSeconds"><option value="2">2 segundos</option><option value="4" selected>4 segundos</option><option value="6">6 segundos</option><option value="8">8 segundos</option></select>
          <button class="btn primary" id="a2dCreate">Dibujar y generar animación 2D</button>
        </div>
        <p class="muted" id="a2dMessage">Claude crea cuatro ilustraciones originales en SVG. JARVIS añade movimiento de cámara y renderiza el MP4. La generación usa tu API de Anthropic y puede consumir créditos.</p>
        <div id="a2dResult"></div>
      </div>
      <h3 class="sectiontitle">Biblioteca</h3><div id="svVideos" class="grid"><div class="empty">Cargando videos...</div></div>`;
    document.querySelector("#stCreate").onclick = createTask;
    document.querySelector("#svUpload").onclick = uploadVideo;
    document.querySelector("#vrCreate").onclick = renderScriptVideo;
    document.querySelector("#a2dCreate").onclick = renderAnimation2D;
    await Promise.all([loadTasks(),loadVideos()]);
  };

  async function createTask() {
    const title=document.querySelector("#stTitle").value.trim();
    const description=document.querySelector("#stDesc").value.trim();
    const msg=document.querySelector("#stMessage");
    if(!title){msg.textContent="Escribe un título primero.";return;}
    msg.textContent="Calculando estimación y guardando...";
    try {
      const task=await request("/api/studio/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,description})});
      notify("Nueva tarea: " + title);
      msg.textContent="Guardada. Tiempo estimado: "+duration(task.estimate_minutes)+". Pulsa Poner a trabajar cuando quieras iniciarla.";
      document.querySelector("#stTitle").value="";document.querySelector("#stDesc").value="";
      await loadTasks();
    } catch(e){msg.textContent=e.message;}
  }

  async function loadTasks() {
    const box=document.querySelector("#stTasks");
    try {
      const tasks=await request("/api/studio/tasks");
      box.innerHTML=tasks.length?tasks.map(t=>`
        <div class="listitem" style="display:block;padding:14px">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>${esc(t.title)}</b><span class="pill">${statusName(t.status)}</span></div>
          <p class="muted">${esc(t.description)}</p><small class="muted">Estimación: ${duration(t.estimate_minutes)} · ${t.initiative?"Iniciativa":"Solicitada"}</small>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            ${t.status!=="completed"?`<button class="btn primary" data-start="${t.id}">${t.status==="in_progress"?"Trabajando":"Poner a trabajar"}</button>`: ""}
            ${t.status==="in_progress"?`<button class="btn" data-pause="${t.id}">Pausar</button><button class="btn" data-done="${t.id}">Marcar terminada</button>`:""}
          </div>
        </div>`).join(""):'<div class="empty">Todavía no hay tareas guardadas.</div>';
      box.querySelectorAll("[data-start]").forEach(b=>b.onclick=async()=>{await request("/api/studio/tasks/"+b.dataset.start+"/start",{method:"POST"});loadTasks();});
      box.querySelectorAll("[data-pause]").forEach(b=>b.onclick=async()=>{await request("/api/studio/tasks/"+b.dataset.pause+"/pause",{method:"POST"});loadTasks();});
      box.querySelectorAll("[data-done]").forEach(b=>b.onclick=async()=>{await request("/api/studio/tasks/"+b.dataset.done+"/complete",{method:"POST"});loadTasks();});
    } catch(e){box.innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
  }


  async function renderScriptVideo() {
    const title=document.querySelector("#vrTitle").value.trim();
    const script=document.querySelector("#vrScript").value.trim();
    const seconds=Number(document.querySelector("#vrSeconds").value);
    const msg=document.querySelector("#vrMessage");
    const result=document.querySelector("#vrResult");
    if(!title || script.length<20){msg.textContent="Añade un título y un guion de al menos 20 caracteres.";return;}
    msg.textContent="Generando el MP4. Puede tardar unos minutos...";
    result.innerHTML="";
    try {
      const data=await request("/api/studio/videos/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,script,seconds_per_scene:seconds,voice_enabled:document.querySelector("#vrVoice").checked,voice:"es-MX-DaliaNeural"})});
      notify("Nuevo video generado: " + title);
      msg.textContent="¡Video creado! "+data.scenes+" escenas · "+data.duration_seconds+" segundos."+ (data.voice_status==="generated"?" · Voz incorporada":"");
      const link=document.createElement("a");
      link.href=API+data.download_url;
      link.textContent="Descargar MP4";
      link.className="btn primary";
      link.setAttribute("download",data.filename);
      result.appendChild(link);
      if(data.subtitle_url){
        const subtitle=document.createElement("a");
        subtitle.href=API+data.subtitle_url;
        subtitle.textContent="Descargar subtítulos (.SRT)";
        subtitle.className="btn";
        subtitle.style.marginLeft="8px";
        subtitle.setAttribute("download","");
        result.appendChild(subtitle);
      }
    } catch(e) { msg.textContent=e.message; }
  }

  async function renderAnimation2D() {
    const title=document.querySelector("#a2dTitle").value.trim();
    const prompt=document.querySelector("#a2dPrompt").value.trim();
    const seconds=Number(document.querySelector("#a2dSeconds").value);
    const msg=document.querySelector("#a2dMessage");
    const result=document.querySelector("#a2dResult");
    if(!title || prompt.length<8){msg.textContent="Añade un título y describe la animación.";return;}
    const btn=document.querySelector("#a2dCreate");
    btn.disabled=true;
    msg.textContent="Claude está dibujando cuatro escenas 2D. Después JARVIS renderizará el MP4; puede tardar varios minutos...";
    result.innerHTML="";
    try {
      const data=await request("/api/studio/videos/animate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,prompt,seconds_per_scene:seconds})});
      notify("Animación 2D creada: "+title);
      msg.textContent="¡Animación creada! "+data.scenes+" escenas · "+data.duration_seconds+" segundos.";
      const link=document.createElement("a");
      link.href=API+data.download_url;
      link.textContent="Descargar MP4";
      link.className="btn primary";
      link.setAttribute("download",data.filename);
      result.appendChild(link);
      const descriptions=document.createElement("p");
      descriptions.className="muted";
      descriptions.textContent=(data.scene_descriptions||[]).join(" · ");
      result.appendChild(descriptions);
      await loadVideos();
    } catch(e) {
      msg.textContent=e.message;
    } finally {
      btn.disabled=false;
    }
  }

  async function uploadVideo() {
    const title=document.querySelector("#svTitle").value.trim();
    const file=document.querySelector("#svFile").files[0];
    const msg=document.querySelector("#svMessage");
    if(!title||!file){msg.textContent="Añade un título y selecciona un video.";return;}
    const form=new FormData();form.append("title",title);form.append("description",document.querySelector("#svDesc").value);form.append("file",file);
    msg.textContent="Subiendo video...";
    try{await request("/api/studio/videos",{method:"POST",body:form});notify("Nuevo video en biblioteca: " + title);msg.textContent="Video guardado en la biblioteca.";document.querySelector("#svFile").value="";await loadVideos();}
    catch(e){msg.textContent=e.message;}
  }

  async function loadVideos() {
    const box=document.querySelector("#svVideos");
    try {
      const videos=await request("/api/studio/videos");
      box.innerHTML=videos.length?videos.map(v=>`
        <div class="card">
          <video controls preload="metadata" style="width:100%;border-radius:10px;background:#000" src="${API+v.url}"></video>
          <h3>${esc(v.title)}</h3><p class="muted">${esc(v.description)}</p>
          <span class="pill">${statusName(v.status)}</span>
          <p class="muted"><small>${(v.size_bytes/1048576).toFixed(1)} MB · ${new Date(v.created_at).toLocaleString()}</small></p>
          <div class="formrow"><select data-video-status="${v.id}"><option value="review">En revisión</option><option value="approved">Aprobado</option><option value="rejected">Rechazado</option><option value="ready_to_publish">Listo para publicar</option></select><button class="btn" data-save-status="${v.id}">Guardar estado</button></div>
        </div>`).join(""):'<div class="empty">Todavía no hay videos. Sube un archivo para comenzar.</div>';
      videos.forEach(v=>{const s=box.querySelector('[data-video-status="'+v.id+'"]');if(s)s.value=v.status;});
      box.querySelectorAll("[data-save-status]").forEach(b=>b.onclick=async()=>{const id=b.dataset.saveStatus;const form=new FormData();form.append("status",box.querySelector('[data-video-status="'+id+'"]').value);await request("/api/studio/videos/"+id+"/status",{method:"POST",body:form});notify("Estado de video actualizado");loadVideos();});
    }catch(e){box.innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
  }
})();
