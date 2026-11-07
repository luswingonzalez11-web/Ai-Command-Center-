/* JARVIS CORE instant small-talk path.
   Keep greetings conversational without waking every agent or spending API tokens. */
(() => {
  const GREETING_PATTERNS = [
    /^(hola+|holi+|hey+|hi+|hello+|buenas(?: tardes| noches| días)?|buen dia|buenos dias|buenas noches|asere|que bola|qué bola|que bolá|dime|ey+)[!.?\s]*$/i,
    /^(como estas|cómo estás|que tal|qué tal|todo bien|como va todo|cómo va todo|me escuchas|estas ahi|estás ahí)[!.?\s]*$/i,
    /^(gracias|muchas gracias|ok|okay|dale|perfecto|jaja+|jeje+|lol)[!.?\s]*$/i
  ];

  function instantReply(message) {
    const q = message.trim().replace(/[¿¡]/g, "").replace(/\s+/g, " ");
    if (!GREETING_PATTERNS.some(pattern => pattern.test(q))) return null;

    const lower = q.toLowerCase();
    if (/^(gracias|muchas gracias)/.test(lower)) return "¡De nada! Aquí estoy contigo. ¿Qué hacemos ahora?";
    if (/^(ok|okay|dale|perfecto)/.test(lower)) return "¡Dale! Seguimos cuando tú quieras.";
    if (/^(jaja+|jeje+|lol)/.test(lower)) return "😂 ¡Jajaja! ¿Qué pasó?";
    if (/^(como estas|cómo estás|que tal|qué tal|todo bien|como va todo|cómo va todo)/.test(lower)) {
      return "¡Todo bien por aquí! 😄 Listo para ayudarte. ¿Y tú, cómo vas?";
    }
    if (/^(me escuchas|estas ahi|estás ahí)/.test(lower)) return "¡Aquí estoy! Te leo perfectamente. 👋";
    return "¡Eyyy! 😄 Aquí estoy, listo para ayudarte. ¿Qué hacemos hoy?";
  }

  function handleGreeting(event) {
    const button = event.target?.closest?.("#send");
    if (!button) return;
    const prompt = document.querySelector("#prompt");
    const images = document.querySelector("#chatImages");
    if (!prompt || (images?.files?.length || 0) > 0) return;
    const q = prompt.value.trim();
    const answer = instantReply(q);
    if (!answer) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (typeof paused !== "undefined" && paused) return;
    const modeSelect = document.querySelector("#chatMode");
    const providerSelect = document.querySelector("#provider");
    const providerId = modeSelect?.value === "team"
      ? "JARVIS · Respuesta instantánea"
      : (providerSelect?.selectedOptions?.[0]?.textContent?.trim() || "JARVIS");
    if (typeof messages === "undefined" || typeof saveChatHistory !== "function" || typeof render !== "function") return;

    messages.unshift({
      q,
      p: providerId,
      a: answer,
      results: [],
      imageNames: [],
      created_at: new Date().toISOString()
    });
    saveChatHistory();
    prompt.value = "";
    if (images) images.value = "";
    if (typeof notifySection === "function") notifySection("ai", "Respuesta instantánea de JARVIS");
    render();
    const status = document.querySelector("#chatStatus");
    if (status) status.textContent = "Aquí estoy. Conversación lista.";
  }

  // Capture before app.js's normal click handler so greetings never trigger provider calls.
  document.addEventListener("click", handleGreeting, true);
})();
