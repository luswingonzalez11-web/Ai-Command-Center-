# JARVIS CORE 2.0 — Web App

MVP independiente de Base44. Interfaz web adaptable a iPhone y escritorio, backend FastAPI y almacenamiento SQLite inicial.

## Requisitos
- Python 3.11+
- Navegador moderno
- Para producción: un servidor HTTPS y PostgreSQL recomendado

## Ejecutar localmente
1. Descomprime el proyecto.
2. Abre una terminal en la carpeta `backend`.
3. Crea un entorno virtual e instala dependencias:
   ```bash
   python -m venv .venv
   # macOS/Linux:
   source .venv/bin/activate
   # Windows:
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Copia `.env.example` a `.env` y agrega tus claves API. Nunca publiques este archivo.
5. Inicia el servidor:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
6. Abre `frontend/index.html` en tu navegador para explorar la interfaz. Para conectar el chat, configura `API_BASE` en `frontend/app.js` con la URL del backend, por ejemplo `http://localhost:8000`.

## Proveedores
El backend incluye adaptadores iniciales:
- OpenAI
- Anthropic Claude
- Google Gemini
- DeepSeek
- xAI Grok

Las llamadas reales requieren claves API válidas y saldo/permisos del proveedor. El adaptador OpenAI-compatible está preparado para OpenAI, DeepSeek y xAI; Claude y Gemini usan sus APIs propias.

## Seguridad antes de producción
- Usa HTTPS.
- Mantén las claves únicamente en variables de entorno del backend.
- Configura autenticación real, autorización por usuario, límites de uso y protección CSRF/CORS.
- Sustituye SQLite por PostgreSQL para multiusuario.
- No habilites publicación automática de redes sin OAuth aprobado y confirmación humana.
- Los controles de seguridad de esta plantilla son una base, no una garantía de protección absoluta.

## Estado del MVP
La interfaz, navegación, paneles, lista de tareas y API de chat están implementados como base inicial. OAuth de TikTok/YouTube, publicación real, pagos, autenticación multiusuario y ejecución autónoma segura requieren integraciones y despliegue adicionales.


## Mission Diagnostics 2.3.0
- Read-only `/api/ops/health` and `/api/ops/diagnostics` endpoints.
- Reports database integrity, configured AI providers, optional integrations, and local video-engine dependencies.
- Never returns API keys or secret values. External provider connectivity is explicitly not inferred.
- CORS credentials are disabled because the current browser client does not use cookie-based authentication.
