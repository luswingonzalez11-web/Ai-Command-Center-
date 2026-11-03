import os, sqlite3, json
from pathlib import Path
from typing import Optional
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()
DB = Path(__file__).with_name("jarvis.db")
app = FastAPI(title="JARVIS CORE API", version="2.0.0")
origin = os.getenv("CORS_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware, allow_origins=[x.strip() for x in origin.split(",")],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

with db() as c:
    c.execute("""CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")

class ChatRequest(BaseModel):
    provider: str = Field(default="openai")
    message: str = Field(min_length=1, max_length=12000)
    model: Optional[str] = None

class TaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)

PROVIDERS = {
    "openai": {"key":"OPENAI_API_KEY","url":"https://api.openai.com/v1/chat/completions","model":"gpt-4o-mini","kind":"openai"},
    "deepseek": {"key":"DEEPSEEK_API_KEY","url":"https://api.deepseek.com/chat/completions","model":"deepseek-chat","kind":"openai"},
    "grok": {"key":"XAI_API_KEY","url":"https://api.x.ai/v1/chat/completions","model":"grok-3-mini","kind":"openai"},
    "claude": {"key":"ANTHROPIC_API_KEY","url":"https://api.anthropic.com/v1/messages","model":"claude-3-5-haiku-latest","kind":"claude"},
    "gemini": {"key":"GEMINI_API_KEY","url":"https://generativelanguage.googleapis.com/v1beta/models/","model":"gemini-2.0-flash","kind":"gemini"},
}

@app.get("/api/health")
def health():
    return {"status":"ok","service":"JARVIS CORE API"}

@app.get("/api/providers")
def providers():
    return [{"id":k,"configured":bool(os.getenv(v["key"])),"default_model":v["model"]} for k,v in PROVIDERS.items()]

@app.post("/api/chat")
async def chat(req: ChatRequest):
    name = req.provider.lower()
    if name not in PROVIDERS:
        raise HTTPException(400, "Proveedor no soportado")
    cfg = PROVIDERS[name]
    key = os.getenv(cfg["key"])
    if not key:
        raise HTTPException(400, f"Falta configurar {cfg['key']} en backend/.env")
    model = req.model or cfg["model"]
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            if cfg["kind"] == "openai":
                r = await client.post(cfg["url"], headers={"Authorization":f"Bearer {key}"},
                    json={"model":model,"messages":[{"role":"system","content":"Eres un agente de JARVIS CORE. Responde en el idioma del usuario y sé claro."},{"role":"user","content":req.message}]})
                data = r.json()
                if r.is_error: raise HTTPException(r.status_code, data.get("error",{}).get("message","Error del proveedor"))
                answer = data["choices"][0]["message"]["content"]
                       elif cfg["kind"] == "claude":
                headers = {
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }

                workspace_id = os.getenv("ANTHROPIC_WORKSPACE_ID")

                if workspace_id:
                    headers["anthropic-workspace-id"] = workspace_id

                r = await client.post(
                    cfg["url"],
                    headers=headers,
                    json={
                        "model": model,
                        "max_tokens": 1200,
                        "system": "Eres un agente de JARVIS CORE. Responde en el idioma del usuario.",
                        "messages": [{"role": "user", "content": req.message}]
                    }
                )

                data = r.json()

                if r.is_error:
                    raise HTTPException(
                        r.status_code,
                        data.get("error", {}).get("message", "Error de Anthropic")
                    )

                answer = "".join(
                    x.get("text", "") for x in data.get("content", [])
                )
                url = cfg["url"] + model + ":generateContent"
                r = await client.post(url, params={"key":key}, json={"contents":[{"parts":[{"text":req.message}]}]})
                data = r.json()
                if r.is_error: raise HTTPException(r.status_code, data.get("error",{}).get("message","Error de Gemini"))
                answer = data["candidates"][0]["content"]["parts"][0]["text"]
        return {"provider":name,"model":model,"answer":answer}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"No se pudo completar la solicitud: {str(e)[:250]}")

@app.get("/api/tasks")
def get_tasks():
    with db() as c:
        return [dict(x) for x in c.execute("SELECT * FROM tasks ORDER BY id DESC LIMIT 100")]

@app.post("/api/tasks")
def add_task(req: TaskRequest):
    with db() as c:
        cur = c.execute("INSERT INTO tasks(title) VALUES(?)",(req.title,))
        row = c.execute("SELECT * FROM tasks WHERE id=?",(cur.lastrowid,)).fetchone()
        return dict(row)
