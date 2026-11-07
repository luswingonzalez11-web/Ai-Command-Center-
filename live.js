(() => {
  let recognition = null;
  let listening = false;
  const $ = s => document.querySelector(s);
  const setState = (state, title, hint, caption) => {
    const stage=$("#liveStage"); if(stage) stage.dataset.state=state;
    const status=$("#liveStatus"); if(status) status.innerHTML='<i></i> '+({idle:"EN ESPERA",listening:"ESCUCHANDO",thinking:"PROCESANDO",speaking:"HABLANDO"}[state]||"EN ESPERA");
    const t=$("#liveControlTitle"); if(t) t.textContent=title;
    const h=$("#liveControlHint"); if(h) h.textContent=hint;
    const c=$("#liveCaption"); if(c) c.textContent=caption;
    const dot=$("#liveDot"); if(dot) dot.style.background=state==="listening"?"#42dca8":state==="thinking"?"#a78bfa":state==="speaking"?"#29d8f1":"#456477";
  };
  window.speakJarvis = text => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0,5000));
    utterance.lang="es-US"; utterance.rate=0.96; utterance.pitch=0.92;
    const voices=window.speechSynthesis.getVoices();
    const spanish=voices.filter(v=>/^es(-|_)/i.test(v.lang));
    const preferred=spanish.find(v=>/male|jorge|pablo|diego|andres|raul/i.test(v.name))||spanish.find(v=>/es-US|es-MX/i.test(v.lang))||spanish[0];
    if(preferred) utterance.voice=preferred;
    utterance.onstart=()=>setState("speaking","JARVIS está hablando","Puedes interrumpirlo cuando quieras","Transmitiendo respuesta...");
    utterance.onend=()=>setState("idle","Pulsa para hablar","También puedes escribir tu mensaje abajo.","A tu servicio. ¿Qué necesitas?");
    utterance.onerror=()=>setState("idle","Pulsa para hablar","La voz no está disponible en este navegador.","Puedes seguir escribiendo.");
    window.speechSynthesis.speak(utterance);
  };
  window.initJarvisLive = () => {
    if (!$("#liveMic")) return;
    const mic=$("#liveMic"), prompt=$("#prompt"), send=$("#send"), auto=$("#autoSpeak");
    window.JARVIS_AUTO_SPEAK=!!(auto&&auto.checked);
    if(auto) auto.onchange=()=>window.JARVIS_AUTO_SPEAK=auto.checked;
    if(send) send.onclick=()=>{
      if(!prompt.value.trim()) return;
      window.JARVIS_AUTO_SPEAK=!!(auto&&auto.checked);
      setState("thinking","JARVIS está pensando","Consultando el cerebro central...","Analizando tu solicitud...");
      window.setTimeout(()=>{},0);
      const oldStatus=$("#chatStatus");
      if(oldStatus) oldStatus.textContent="JARVIS está procesando tu mensaje...";
      window.sendChatOriginal?.();
    };
    // The main app owns the send action; wrap it once so both typed and spoken messages use the same API.
    if(send && !send.dataset.liveBound){
      send.dataset.liveBound="1";
      send.onclick=()=>{
        if(!prompt.value.trim()) return;
        window.JARVIS_AUTO_SPEAK=!!(auto&&auto.checked);
        setState("thinking","JARVIS está pensando","Consultando el cerebro central...","Analizando tu solicitud...");
        window.jarvisSendChat?.();
      };
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){mic.disabled=true;mic.title="Reconocimiento de voz no compatible";setState("idle","Voz no disponible aquí","Prueba Safari actualizado o Chrome; también puedes escribir.","El chat escrito sigue disponible.");return;}
    mic.onclick=()=>{
      if(listening){recognition?.stop();return;}
      recognition=new SR(); recognition.lang="es-US"; recognition.interimResults=true; recognition.continuous=false;
      recognition.onstart=()=>{listening=true;mic.classList.add("active");mic.querySelector("span").textContent="■";setState("listening","Te estoy escuchando","Habla con claridad. Pulsa de nuevo para detener.","Escuchando tu mensaje...");};
      recognition.onresult=e=>{let transcript="";for(let i=e.resultIndex;i<e.results.length;i++)transcript+=e.results[i][0].transcript;if(prompt)prompt.value=transcript;};
      recognition.onerror=e=>{setState("idle","No pude escuchar","Revisa el permiso del micrófono e inténtalo otra vez.", "Micrófono: "+e.error);};
      recognition.onend=()=>{listening=false;mic.classList.remove("active");mic.querySelector("span").textContent="🎙";if(prompt&&prompt.value.trim()){window.JARVIS_AUTO_SPEAK=!!(auto&&auto.checked);setState("thinking","Procesando tu voz","Enviando al cerebro central...","Entendí: "+prompt.value.slice(0,100));window.jarvisSendChat?.();}else setState("idle","Pulsa para hablar","También puedes escribir tu mensaje abajo.","A tu servicio. ¿Qué necesitas?");};
      recognition.start();
    };
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>window.initJarvisLive());else window.initJarvisLive();
})();