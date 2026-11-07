(() => {
 const API="https://jarvis-core-wvls.onrender.com";
 const nav=document.querySelector("#nav");
 if(!nav||document.querySelector("#opsNav"))return;
 const button=document.createElement("button");
 button.id="opsNav";button.className="navitem";button.type="button";button.textContent="◎　Mission Diagnostics";nav.appendChild(button);
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const label=v=>({ok:"Correcto",operational:"Operativo",degraded:"Revisar",not_initialized:"Sin inicializar"}[v]||v||"Desconocido");
 const cls=v=>v==="ok"||v==="operational"?"ops-good":v==="not_initialized"?"ops-neutral":"ops-warn";
 button.addEventListener("click",render);
 async function render(){
  document.querySelectorAll(".navitem").forEach(x=>x.classList.remove("active"));button.classList.add("active");
  document.querySelector("#pageTitle").textContent="Mission Diagnostics";
  const root=document.querySelector("#content");
  root.innerHTML='<section class="ops-hero"><div><div class="eyebrow">JARVIS CORE · SYSTEM OBSERVABILITY</div><h2>Mission Diagnostics</h2><p>Estado de configuración, bases de datos y motores. Sin revelar claves privadas.</p></div><div class="ops-orb">◎</div></section><div class="ops-toolbar"><span id="opsChecked">Consultando servidor…</span><button class="btn primary" id="opsRefresh">↻ Actualizar diagnóstico</button></div><div id="opsResults" class="ops-grid"><div class="card">Cargando…</div></div><p class="footer">Los indicadores muestran configuración y comprobaciones locales; no garantizan conectividad externa ni permisos de publicación.</p>';
  document.querySelector("#opsRefresh").addEventListener("click",load);await load();
 }
 async function load(){
  const box=document.querySelector("#opsResults");if(!box)return;box.innerHTML='<div class="card">Actualizando diagnóstico…</div>';
  try{
   const response=await fetch(API+"/api/ops/diagnostics",{cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);
   const d=await response.json();document.querySelector("#opsChecked").textContent="Última comprobación: "+new Date(d.checked_at).toLocaleString();
   const card=(title,status,detail)=>'<article class="card ops-card"><div class="ops-card-head"><h3>'+esc(title)+'</h3><span class="ops-state '+cls(status)+'">'+esc(label(status))+'</span></div><p>'+esc(detail||"")+'</p></article>';
   let html='<article class="card ops-summary"><div class="eyebrow">ESTADO GENERAL</div><div class="ops-summary-value '+cls(d.overall)+'">'+esc(label(d.overall))+'</div><p>JARVIS CORE · API de operaciones</p></article>';
   Object.entries(d.databases||{}).forEach(([k,v])=>html+=card("Base de datos · "+k,v.status,"Comprobación SQLite de integridad rápida."));
   (d.providers||[]).forEach(v=>html+=card("Agente · "+v.id,v.configured?"ok":"not_initialized",v.configured?"Variable de entorno presente.":"Clave no configurada en el backend."));
   Object.entries(d.integrations||{}).forEach(([k,v])=>html+=card(k.replaceAll("_"," "),v?"ok":"not_initialized","Estado de configuración, sin mostrar secretos."));
   Object.entries(d.engines||{}).forEach(([k,v])=>html+=card(k.replaceAll("_"," "),v?"ok":"degraded","Disponibilidad de dependencias locales."));
   html+='<article class="card ops-note"><h3>Seguridad y alcance</h3><p>'+esc(d.security.note)+'</p><p>Las claves nunca se muestran. La conectividad externa no se simula.</p></article>';box.innerHTML=html;
  }catch(e){document.querySelector("#opsChecked").textContent="No se pudo verificar el backend";box.innerHTML='<div class="card ops-error">'+esc(e.message)+'<p>Comprueba el despliegue de Render.</p></div>';}
 }
 window.jarvisRenderOps=render;
})();