import os
import json
import sqlite3
import secrets
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

BASE = Path(__file__).resolve().parent
DB = BASE / "jarvis.db"

# Workspace separado del código principal
WORKSPACE = (BASE / "workspace").resolve()
WORKSPACE.mkdir(parents=True, exist_ok=True)

APPROVED_EXTENSIONS = {
    ".html", ".css", ".js", ".json", ".md", ".txt", ".svg"
}

MAX_FILE_SIZE = 200_000

app = FastAPI(
    title="JARVIS CORE API",
    version="3.0.0"
)

origin = os.getenv("CORS_ORIGIN", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in origin.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


with db() as c:
    c.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dev_proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            filename TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            applied_at DATETIME
        )
    """)


class ChatRequest(BaseModel):
    provider: str = Field(default="openai")
    message: str = Field(min_length=1, max_length=12000)
    model: Optional[str] = None


class TaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)


class DevProposalRequest(BaseModel):
    provider: str
    filename: str
    content: str = Field(min_length=1, max_length=200000)


class DevReadRequest(BaseModel):
    filename: str


PROVIDERS = {
    "openai": {
        "key": "OPENAI_API_KEY",
        "url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o-mini",
        "kind": "openai",
    },
    "deepseek": {
        "key": "DEEPSEEK_API_KEY",
        "url": "https://api.deepseek.com/chat/completions",
        "model": "deepseek-chat",
        "kind": "openai",
    },
    "grok": {
        "key": "XAI_API_KEY",
        "url": "https://api.x.ai/v1/chat/completions",
        "model": "grok-3-mini",
        "kind": "openai",
    },
    "claude": {
        "key": "ANTHROPIC_API_KEY",
        "url": "https://api.anthropic.com/v1/messages",
        "model": "claude-haiku-5-5",
        "kind": "claude",
    },
    "gemini": {
        "key": "GEMINI_API_KEY",
        "url": "https://generativelanguage.googleapis.com/v1beta/models/",
        "model": "gemini-2.0-flash",
        "kind": "gemini",
    },
}


# --------------------------------------------------
# DEVELOPER ACCESS SECURITY
# --------------------------------------------------

def require_admin(token: Optional[str]):
    expected = os.getenv("JARVIS_ADMIN_TOKEN")

    if not expected:
        raise HTTPException(
            503,
            "Developer Access no está configurado. Falta JARVIS_ADMIN_TOKEN."
        )

    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(403, "Acceso de administrador denegado.")


def safe_workspace_path(filename: str) -> Path:
    candidate = Path(filename)

    if candidate.is_absolute():
        raise HTTPException(400, "Ruta absoluta no permitida.")

    if not candidate.parts:
        raise HTTPException(400, "Nombre de archivo inválido.")

    if any(part in ("..", ".") for part in candidate.parts):
        raise HTTPException(400, "Ruta no permitida.")

    if candidate.suffix.lower() not in APPROVED_EXTENSIONS:
        raise HTTPException(400, "Tipo de archivo no autorizado.")

    target = (WORKSPACE / candidate).resolve()

    if not target.is_relative_to(WORKSPACE):
        raise HTTPException(400, "Ruta fuera del workspace.")

    return target


def check_developer(provider: str):
    if provider not in ("openai", "claude"):
        raise HTTPException(
            403,
            "Solo ChatGPT y Claude tienen permisos de desarrollo."
        )


# --------------------------------------------------
# GENERAL API
# --------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "JARVIS CORE API",
        "version": "3.0.0"
    }


@app.get("/api/providers")
def providers():
    return [
        {
            "id": name,
            "configured": bool(os.getenv(config["key"])),
            "default_model": config["model"],
            "developer_access": name in ("openai", "claude")
        }
        for name, config in PROVIDERS.items()
    ]


# --------------------------------------------------
# CHAT
# --------------------------------------------------

@app.post("/api/chat")
async def chat(req: ChatRequest):
    name = req.provider.lower()

    if name not in PROVIDERS:
        raise HTTPException(400, "Proveedor no soportado")

    cfg = PROVIDERS[name]
    key = os.getenv(cfg["key"])

    if not key:
        raise HTTPException(
            400,
            f"Falta configurar {cfg['key']} en Render Environment"
        )

    model = req.model or cfg["model"]

    try:
        async with httpx.AsyncClient(timeout=90) as client:

            if cfg["kind"] == "openai":
                r = await client.post(
                    cfg["url"],
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "Eres un agente de JARVIS CORE. "
                                    "Responde en el idioma del usuario y sé claro."
                                )
                            },
                            {
                                "role": "user",
                                "content": req.message
                            }
                        ]
                    }
                )

                data = r.json()

                if r.is_error:
                    raise HTTPException(
                        r.status_code,
                        data.get("error", {}).get(
                            "message", "Error del proveedor"
                        )
                    )

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
                        "system": (
                            "Eres un agente de JARVIS CORE. "
                            "Responde en el idioma del usuario."
                        ),
                        "messages": [
                            {
                                "role": "user",
                                "content": req.message
                            }
                        ]
                    }
                )

                data = r.json()

                if r.is_error:
                    raise HTTPException(
                        r.status_code,
                        data.get("error", {}).get(
                            "message", "Error de Anthropic"
                        )
                    )

                answer = "".join(
                    item.get("text", "")
                    for item in data.get("content", [])
                    if item.get("type") == "text"
                )

            else:
                url = cfg["url"] + model + ":generateContent"

                r = await client.post(
                    url,
                    params={"key": key},
                    json={
                        "contents": [
                            {
                                "parts": [
                                    {"text": req.message}
                                ]
                            }
                        ]
                    }
                )

                data = r.json()

                if r.is_error:
                    raise HTTPException(
                        r.status_code,
                        data.get("error", {}).get(
                            "message", "Error de Gemini"
                        )
                    )

                answer = data["candidates"][0]["content"]["parts"][0]["text"]

        return {
            "provider": name,
            "model": model,
            "answer": answer
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            502,
            f"No se pudo completar la solicitud: {str(e)[:250]}"
        )


# --------------------------------------------------
# DEVELOPER ACCESS
# --------------------------------------------------

@app.get("/api/dev/status")
def developer_status(
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    return {
        "developer_access": True,
        "authorized_agents": ["openai", "claude"],
        "workspace": "isolated",
        "automatic_production_deploy": False,
        "human_approval_required": True,
        "allowed_extensions": sorted(APPROVED_EXTENSIONS)
    }


@app.get("/api/dev/files")
def developer_files(
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    files = []

    for path in WORKSPACE.rglob("*"):
        if path.is_file() and path.suffix.lower() in APPROVED_EXTENSIONS:
            files.append(str(path.relative_to(WORKSPACE)))

    return {"files": files}


@app.post("/api/dev/read")
def developer_read(
    req: DevReadRequest,
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    path = safe_workspace_path(req.filename)

    if not path.is_file():
        raise HTTPException(404, "Archivo no encontrado.")

    if path.stat().st_size > MAX_FILE_SIZE:
        raise HTTPException(413, "Archivo demasiado grande.")

    return {
        "filename": req.filename,
        "content": path.read_text(encoding="utf-8")
    }


@app.post("/api/dev/proposals")
def create_proposal(
    req: DevProposalRequest,
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    provider = req.provider.lower()
    check_developer(provider)

    path = safe_workspace_path(req.filename)

    if len(req.content.encode("utf-8")) > MAX_FILE_SIZE:
        raise HTTPException(413, "El archivo supera el límite permitido.")

    with db() as c:
        cur = c.execute(
            """
            INSERT INTO dev_proposals(provider, filename, content)
            VALUES (?, ?, ?)
            """,
            (provider, str(path.relative_to(WORKSPACE)), req.content)
        )

        proposal_id = cur.lastrowid

    return {
        "id": proposal_id,
        "provider": provider,
        "filename": req.filename,
        "status": "pending",
        "message": "Propuesta guardada. Espera aprobación humana."
    }


@app.get("/api/dev/proposals")
def list_proposals(
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    with db() as c:
        rows = c.execute(
            """
            SELECT id, provider, filename, status, created_at, applied_at
            FROM dev_proposals
            ORDER BY id DESC
            LIMIT 100
            """
        ).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/dev/proposals/{proposal_id}/approve")
def approve_proposal(
    proposal_id: int,
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    with db() as c:
        row = c.execute(
            "SELECT * FROM dev_proposals WHERE id = ?",
            (proposal_id,)
        ).fetchone()

        if not row:
            raise HTTPException(404, "Propuesta no encontrada.")

        if row["status"] != "pending":
            raise HTTPException(409, "La propuesta ya fue procesada.")

        path = safe_workspace_path(row["filename"])

        path.parent.mkdir(parents=True, exist_ok=True)

        # No sobrescribir archivos existentes.
        if path.exists():
            raise HTTPException(
                409,
                "El archivo ya existe. No se permite sobrescribirlo."
            )

        path.write_text(row["content"], encoding="utf-8")

        c.execute(
            """
            UPDATE dev_proposals
            SET status = 'approved',
                applied_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (proposal_id,)
        )

    return {
        "id": proposal_id,
        "status": "approved",
        "filename": row["filename"],
        "location": "isolated workspace",
        "production_deployed": False
    }


@app.post("/api/dev/proposals/{proposal_id}/reject")
def reject_proposal(
    proposal_id: int,
    x_jarvis_admin_token: Optional[str] = Header(default=None)
):
    require_admin(x_jarvis_admin_token)

    with db() as c:
        row = c.execute(
            "SELECT status FROM dev_proposals WHERE id = ?",
            (proposal_id,)
        ).fetchone()

        if not row:
            raise HTTPException(404, "Propuesta no encontrada.")

        if row["status"] != "pending":
            raise HTTPException(409, "La propuesta ya fue procesada.")

        c.execute(
            """
            UPDATE dev_proposals
            SET status = 'rejected'
            WHERE id = ?
            """,
            (proposal_id,)
        )

    return {"id": proposal_id, "status": "rejected"}


# --------------------------------------------------
# TASKS
# --------------------------------------------------

@app.get("/api/tasks")
def get_tasks():
    with db() as c:
        rows = c.execute(
            "SELECT * FROM tasks ORDER BY id DESC LIMIT 100"
        ).fetchall()

        return [dict(row) for row in rows]


@app.post("/api/tasks")
def add_task(req: TaskRequest):
    with db() as c:
        cur = c.execute(
            "INSERT INTO tasks(title) VALUES(?)",
            (req.title,)
        )

        row = c.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (cur.lastrowid,)
        ).fetchone()

        return dict(row)
