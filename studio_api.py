import os
import sqlite3
import uuid
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/studio", tags=["Task Manager & Video Studio"])
BASE = Path(__file__).resolve().parent
DB = BASE / "jarvis_studio.db"
VIDEO_DIR = BASE / "uploads" / "videos"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
MAX_VIDEO_BYTES = 250 * 1024 * 1024
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}

def connect():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

with connect() as c:
    c.execute("""CREATE TABLE IF NOT EXISTS studio_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        estimate_minutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        initiative INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS studio_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        filename TEXT NOT NULL,
        media_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'review',
        created_at TEXT NOT NULL
    )""")

class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=4000)
    initiative: bool = False

def estimate(title: str, description: str) -> int:
    text = (title + " " + description).lower()
    score = 60
    for words, minutes in [
        (("simple", "texto", "etiqueta", "ajuste"), 30),
        (("integrar", "api", "autenticación", "oauth"), 180),
        (("video", "reproductor", "biblioteca", "subida"), 120),
        (("backend", "base de datos", "automatizar", "multiagente"), 240),
        (("rediseñar", "completo", "migración", "seguridad"), 360),
    ]:
        if any(w in text for w in words):
            score = max(score, minutes)
    return score

@router.get("/tasks")
def list_tasks():
    with connect() as c:
        rows = c.execute("SELECT * FROM studio_tasks ORDER BY id DESC LIMIT 200").fetchall()
    return [dict(r) for r in rows]

@router.post("/tasks")
def create_task(req: TaskCreate):
    minutes = estimate(req.title, req.description)
    now = datetime.now(timezone.utc).isoformat()
    with connect() as c:
        cur = c.execute(
            "INSERT INTO studio_tasks(title,description,estimate_minutes,initiative,created_at) VALUES(?,?,?,?,?)",
            (req.title, req.description, minutes, int(req.initiative), now)
        )
        row = c.execute("SELECT * FROM studio_tasks WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)

@router.post("/tasks/{task_id}/start")
def start_task(task_id: int):
    now = datetime.now(timezone.utc).isoformat()
    with connect() as c:
        row = c.execute("SELECT * FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Tarea no encontrada")
        if row["status"] == "completed":
            raise HTTPException(409, "La tarea ya está completada")
        c.execute("UPDATE studio_tasks SET status='in_progress', started_at=COALESCE(started_at, ?) WHERE id=?", (now, task_id))
        updated = c.execute("SELECT * FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
    return dict(updated)

@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int):
    now = datetime.now(timezone.utc).isoformat()
    with connect() as c:
        row = c.execute("SELECT id FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Tarea no encontrada")
        c.execute("UPDATE studio_tasks SET status='completed', completed_at=? WHERE id=?", (now, task_id))
        updated = c.execute("SELECT * FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
    return dict(updated)

@router.post("/tasks/{task_id}/pause")
def pause_task(task_id: int):
    with connect() as c:
        row = c.execute("SELECT id FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Tarea no encontrada")
        c.execute("UPDATE studio_tasks SET status='queued' WHERE id=?", (task_id,))
        updated = c.execute("SELECT * FROM studio_tasks WHERE id=?", (task_id,)).fetchone()
    return dict(updated)

@router.post("/videos")
async def upload_video(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...)
):
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(415, "Formato no permitido. Usa MP4, WebM o MOV.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".mp4", ".webm", ".mov"}:
        raise HTTPException(415, "Extensión de video no permitida.")
    video_id = uuid.uuid4().hex
    safe_name = video_id + suffix
    target = VIDEO_DIR / safe_name
    size = 0
    try:
        with target.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    raise HTTPException(413, "El video supera el límite de 250 MB.")
                out.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    now = datetime.now(timezone.utc).isoformat()
    with connect() as c:
        cur = c.execute(
            "INSERT INTO studio_videos(title,description,filename,media_type,size_bytes,created_at) VALUES(?,?,?,?,?,?)",
            (title[:180], description[:4000], safe_name, file.content_type, size, now)
        )
        row = c.execute("SELECT * FROM studio_videos WHERE id=?", (cur.lastrowid,)).fetchone()
    item = dict(row)
    item["url"] = f"/api/studio/videos/{item['id']}/file"
    return item

@router.get("/videos")
def list_videos():
    with connect() as c:
        rows = c.execute("SELECT * FROM studio_videos ORDER BY id DESC LIMIT 200").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["url"] = f"/api/studio/videos/{item['id']}/file"
        result.append(item)
    return result

@router.get("/videos/{video_id}/file")
def get_video(video_id: int):
    from fastapi.responses import FileResponse
    with connect() as c:
        row = c.execute("SELECT * FROM studio_videos WHERE id=?", (video_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Video no encontrado")
    path = VIDEO_DIR / row["filename"]
    if not path.is_file():
        raise HTTPException(404, "El archivo no está disponible en el almacenamiento del servidor")
    return FileResponse(path, media_type=row["media_type"], filename=row["filename"])

@router.post("/videos/{video_id}/status")
def set_video_status(video_id: int, status: str = Form(...)):
    if status not in {"review", "approved", "rejected", "ready_to_publish"}:
        raise HTTPException(400, "Estado no válido")
    with connect() as c:
        row = c.execute("SELECT id FROM studio_videos WHERE id=?", (video_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Video no encontrado")
        c.execute("UPDATE studio_videos SET status=? WHERE id=?", (status, video_id))
        updated = c.execute("SELECT * FROM studio_videos WHERE id=?", (video_id,)).fetchone()
    item = dict(updated)
    item["url"] = f"/api/studio/videos/{video_id}/file"
    return item
