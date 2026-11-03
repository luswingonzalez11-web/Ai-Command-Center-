import os
import json
import re
import sqlite3
import uuid
import subprocess
import tempfile
import textwrap
import asyncio
import httpx
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/studio", tags=["Task Manager & Video Studio"])
BASE = Path(__file__).resolve().parent
DB = BASE / "jarvis_studio.db"
VIDEO_DIR = BASE / "uploads" / "videos"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)
RENDER_DIR = BASE / "uploads" / "renders"
RENDER_DIR.mkdir(parents=True, exist_ok=True)
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

class VideoRenderRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    script: str = Field(min_length=20, max_length=12000)
    seconds_per_scene: int = Field(default=4, ge=2, le=8)
    voice_enabled: bool = False
    voice: str = Field(default="es-MX-DaliaNeural", pattern=r"^es-(MX|ES)-[A-Za-z]+Neural$")

class VideoAnimateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=8, max_length=6000)
    seconds_per_scene: int = Field(default=4, ge=2, le=8)


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
    # Uploaded videos live in VIDEO_DIR; generated MP4s live in RENDER_DIR.
    # Check both locations so library playback works for either kind of video.
    path = VIDEO_DIR / row["filename"]
    if not path.is_file():
        path = RENDER_DIR / row["filename"]
    if not path.is_file():
        raise HTTPException(404, "El archivo no está disponible en el almacenamiento del servidor")
    # Serve inline so the HTML5 <video> element can play the file instead of forcing a download.
    return FileResponse(path, media_type=row["media_type"])

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


@router.post("/videos/render")
def render_script_video(req: VideoRenderRequest):
    """Create a vertical storyboard MP4 from a script."""
    try:
        import imageio_ffmpeg
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise HTTPException(503, "Faltan dependencias del motor MP4.")

    scenes = [p.strip() for p in req.script.replace("\r", "").split("\n") if p.strip()]
    if len(scenes) == 1:
        words = scenes[0].split()
        scenes = [" ".join(words[i:i+24]) for i in range(0, len(words), 24)]
    scenes = scenes[:30]
    if not scenes:
        raise HTTPException(400, "El guion no contiene escenas.")

    filename = uuid.uuid4().hex + ".mp4"
    target = RENDER_DIR / filename
    width, height, fps = 720, 1280, 24
    try:
        regular = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
        bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 46)
    except OSError:
        regular, bold = ImageFont.load_default(), ImageFont.load_default()

    try:
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "frames.txt"
            with manifest.open("w", encoding="utf-8") as listing:
                for scene_no, scene in enumerate(scenes):
                    for frame_no in range(req.seconds_per_scene * fps):
                        # Procedural, scene-aware artwork: no image API or paid credits.
                        lower = scene.lower()
                        palettes = [
                            ((5, 14, 29), (8, 43, 61), (25, 190, 220)),
                            ((22, 8, 30), (75, 20, 55), (245, 80, 110)),
                            ((8, 24, 18), (20, 75, 48), (100, 220, 150)),
                            ((25, 18, 7), (90, 58, 18), (245, 185, 75))
                        ]
                        bg, glow, accent = palettes[scene_no % len(palettes)]
                        if any(k in lower for k in ("laboratorio", "virus", "infect", "zombi", "brote", "sangre")):
                            bg, glow, accent = (18, 5, 12), (95, 18, 35), (235, 55, 75)
                        elif any(k in lower for k in ("militar", "soldado", "ejército", "base", "arma")):
                            bg, glow, accent = (12, 22, 17), (45, 65, 40), (180, 195, 125)
                        elif any(k in lower for k in ("noche", "oscuro", "sombra", "miedo", "misterio")):
                            bg, glow, accent = (5, 8, 25), (30, 32, 75), (115, 125, 245)
                        image = Image.new("RGB", (width, height), bg)
                        draw = ImageDraw.Draw(image)
                        shift = int(35 * frame_no / max(1, req.seconds_per_scene * fps - 1))
                        draw.rectangle((0, 0, width, 12), fill=accent)
                        # Layered atmospheric rings and a focal illustration.
                        for radius in (250, 205, 155, 105):
                            cx, cy = 360 + shift, 390
                            draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), outline=glow, width=5)
                        if any(k in lower for k in ("laboratorio", "virus", "infect", "zombi", "brote")):
                            draw.ellipse((250+shift, 245, 470+shift, 465), fill=glow, outline=accent, width=7)
                            draw.ellipse((300+shift, 295, 420+shift, 415), outline=accent, width=5)
                            draw.line((270+shift, 355, 450+shift, 355), fill=accent, width=5)
                            draw.line((360+shift, 255, 360+shift, 455), fill=accent, width=5)
                        elif any(k in lower for k in ("militar", "soldado", "ejército", "base")):
                            draw.rectangle((285+shift, 250, 435+shift, 500), fill=glow, outline=accent, width=6)
                            draw.polygon([(285+shift,250),(360+shift,175),(435+shift,250)], fill=glow, outline=accent)
                            draw.rectangle((330+shift, 330, 390+shift, 500), outline=accent, width=5)
                        else:
                            draw.ellipse((245+shift, 235, 475+shift, 465), fill=glow, outline=accent, width=7)
                            draw.ellipse((305+shift, 295, 415+shift, 405), outline=accent, width=5)
                        draw.text((48, 65), "JARVIS CORE / VIDEO STUDIO", font=regular, fill=accent)
                        draw.text((48, 545), "ESCENA " + str(scene_no + 1).zfill(2), font=bold, fill=(235, 249, 255))
                        y = 640
                        for line in textwrap.wrap(scene, width=29)[:9]:
                            draw.text((48, y), line, font=regular, fill=(232, 242, 250))
                            y += 52
                        draw.rectangle((48, 1170, 672, 1178), fill=(35, 62, 78))
                        draw.rectangle((48, 1170, 48 + int(624 * ((scene_no + 1) / len(scenes))), 1178), fill=(38, 211, 232))
                        frame_name = "frame_" + str(scene_no).zfill(3) + "_" + str(frame_no).zfill(4) + ".jpg"
                        frame_path = Path(tmp) / frame_name
                        image.save(frame_path, quality=88)
                        listing.write("file '" + str(frame_path) + "'\n")
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            result = subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(manifest),
                 "-r", str(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", str(target)],
                capture_output=True, text=True, timeout=240
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr[-1000:])
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(500, "No se pudo crear el MP4: " + str(exc)[:400])

    # Export a synchronized SRT subtitle track alongside the MP4.
    subtitle_name = Path(filename).with_suffix(".srt").name
    subtitle_path = RENDER_DIR / subtitle_name
    def srt_time(seconds):
        whole = int(seconds)
        millis = int(round((seconds - whole) * 1000))
        if millis == 1000:
            whole += 1
            millis = 0
        hours, rem = divmod(whole, 3600)
        minutes, secs = divmod(rem, 60)
        return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"
    with subtitle_path.open("w", encoding="utf-8") as srt:
        for index, scene in enumerate(scenes):
            start = index * req.seconds_per_scene
            end = start + req.seconds_per_scene
            srt.write(f"{index + 1}\\n{srt_time(start)} --> {srt_time(end)}\\n{scene}\\n\\n")

    voice_status = "disabled"
    if req.voice_enabled:
        try:
            import edge_tts
            audio_path = RENDER_DIR / (Path(filename).stem + ".mp3")
            speech_text = " ".join(scenes)
            async def create_voice():
                communicate = edge_tts.Communicate(speech_text, req.voice)
                await communicate.save(str(audio_path))
            asyncio.run(create_voice())
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            voiced_path = RENDER_DIR / (Path(filename).stem + "_voiced.mp4")
            mux = subprocess.run(
                [ffmpeg, "-y", "-i", str(target), "-i", str(audio_path),
                 "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                 "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags",
                 "+faststart", str(voiced_path)],
                capture_output=True, text=True, timeout=240
            )
            audio_path.unlink(missing_ok=True)
            if mux.returncode != 0:
                voiced_path.unlink(missing_ok=True)
                raise RuntimeError(mux.stderr[-800:])
            target.unlink(missing_ok=True)
            voiced_path.replace(target)
            voice_status = "generated"
        except Exception as exc:
            target.unlink(missing_ok=True)
            subtitle_path.unlink(missing_ok=True)
            raise HTTPException(502, "No se pudo generar o incorporar la voz. Inténtalo de nuevo: " + str(exc)[:250])

    # Register generated MP4 in the library queried by /api/studio/videos.
    now = datetime.now(timezone.utc).isoformat()
    with connect() as c:
        cur = c.execute(
            "INSERT INTO studio_videos(title,description,filename,media_type,size_bytes,status,created_at) VALUES(?,?,?,?,?,?,?)",
            (req.title[:180], req.script[:4000], filename, "video/mp4", target.stat().st_size, "review", now)
        )
        library_id = cur.lastrowid

    return {
        "video_id": library_id,
        "library_url": f"/api/studio/videos/{library_id}/file",
        "status": "review",
        "title": req.title, "filename": filename, "scenes": len(scenes), "voice_status": voice_status,
        "duration_seconds": len(scenes) * req.seconds_per_scene,
        "download_url": "/api/studio/renders/" + filename,
        "subtitle_url": "/api/studio/subtitles/" + subtitle_name
    }




@router.post("/videos/animate")
async def animate_from_description(req: VideoAnimateRequest):
    """Use Claude to draw illustrated 2D SVG scenes, then render them into an animated MP4."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(503, "Falta ANTHROPIC_API_KEY en Render.")
    try:
        import cairosvg
        from PIL import Image, ImageEnhance
        import imageio_ffmpeg
    except ImportError as exc:
        raise HTTPException(503, "Falta una dependencia del motor 2D: " + str(exc))

    model = os.getenv("ANTHROPIC_VIDEO_MODEL", "claude-haiku-5-5")
    prompt = (
        "Create exactly 4 distinct, coherent hand-drawn 2D cartoon/graphic-novel illustrations for a vertical horror short. "
        "Draw actual environments, props and characters with layered backgrounds, strong silhouettes, expressive poses, "
        "consistent character designs, cinematic lighting and detailed composition. Never make text cards or abstract placeholders. "
        "Each illustration must be a complete standalone SVG with width='720', height='1280', viewBox='0 0 720 1280'. "
        "Use only safe vector elements: svg, title, desc, defs, linearGradient, radialGradient, stop, g, path, rect, circle, ellipse, line, polygon, polyline. "
        "No scripts, foreignObject, external URLs, external images, embedded animation, or Markdown. "
        "IMPORTANT OUTPUT FORMAT: Do NOT return JSON. Return exactly four complete SVG documents one after another, with the literal separator line ===SCENE=== between them. "
        "Inside each SVG, put a short scene description in its first <title> element. Use compact SVG markup and single quotes for XML attributes. "
        "Keep each illustration visually rich but concise so all four fit in one response. "
        "Story description: " + req.prompt
    )
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    workspace_id = os.getenv("ANTHROPIC_WORKSPACE_ID")
    if workspace_id:
        headers["anthropic-workspace-id"] = workspace_id
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json={"model": model, "max_tokens": 12000,
                      "messages": [{"role": "user", "content": prompt}]}
            )
        data = response.json()
        if response.is_error:
            detail = data.get("error", {}).get("message", "Error de Claude")
            raise HTTPException(response.status_code, "Claude: " + detail[:500])
        raw = "\\n".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text").strip()
        if not raw:
            raise ValueError("Claude respondió sin texto (stop_reason=" + str(data.get("stop_reason")) + ").")
        if data.get("stop_reason") == "max_tokens":
            raise ValueError("Claude agotó el límite de salida antes de terminar las ilustraciones. Reduce el texto del guion o inténtalo otra vez.")
        # Parse SVG documents directly; this avoids fragile JSON escaping of XML attributes and path data.
        svg_documents = re.findall(r"<svg\\b[\\s\\S]*?</svg>", raw, flags=re.I)
        if len(svg_documents) != 4:
            raise ValueError("Claude devolvió " + str(len(svg_documents)) + " SVG completos; se necesitan 4. Inténtalo otra vez.")
        scenes = []
        for index, svg in enumerate(svg_documents):
            title_match = re.search(r"<title[^>]*>([\\s\\S]*?)</title>", svg, flags=re.I)
            description = re.sub(r"<[^>]+>", "", title_match.group(1)).strip() if title_match else "Escena " + str(index + 1)
            scenes.append({"description": description[:300], "svg": svg})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "No se pudieron crear las escenas 2D: " + str(exc)[:400])

    filename = uuid.uuid4().hex + ".mp4"
    target = RENDER_DIR / filename
    width, height, fps = 720, 1280, 20
    descriptions = []
    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            manifest = tmpdir / "frames.txt"
            with manifest.open("w", encoding="utf-8") as listing:
                for scene_index, scene in enumerate(scenes):
                    svg = scene.get("svg", "")
                    description = str(scene.get("description", "Escena " + str(scene_index + 1)))[:300]
                    descriptions.append(description)
                    lowered = svg.lower()
                    if "<script" in lowered or "foreignobject" in lowered or "http://" in lowered or "https://" in lowered:
                        raise ValueError("Claude devolvió SVG con contenido externo o no permitido.")
                    if not re.search(r"<svg[\s>]", svg, re.I) or not re.search(r"</svg>", svg, re.I):
                        raise ValueError("Una escena no contiene un SVG completo.")
                    base_png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=width, output_height=height)
                    base_path = tmpdir / ("scene_" + str(scene_index) + ".png")
                    base_path.write_bytes(base_png)
                    with Image.open(base_path) as opened:
                        base_image = opened.convert("RGB")
                    total_frames = req.seconds_per_scene * fps
                    for frame_no in range(total_frames):
                        progress = frame_no / max(1, total_frames - 1)
                        zoom = 1.0 + 0.045 * progress
                        scaled = base_image.resize((int(width * zoom), int(height * zoom)), Image.Resampling.LANCZOS)
                        max_x = max(0, scaled.width - width)
                        max_y = max(0, scaled.height - height)
                        # Slow cinematic camera drift gives the illustrated scene motion.
                        left = int(max_x * progress * (1 if scene_index % 2 == 0 else 0.25))
                        top = int(max_y * progress * (0.25 if scene_index % 2 == 0 else 1))
                        frame = scaled.crop((left, top, left + width, top + height))
                        # Subtle exposure flicker for a hand-rendered animation feel.
                        if frame_no % 7 == 0:
                            frame = ImageEnhance.Brightness(frame).enhance(0.97)
                        frame_name = "frame_" + str(scene_index).zfill(2) + "_" + str(frame_no).zfill(4) + ".jpg"
                        frame_path = tmpdir / frame_name
                        frame.save(frame_path, quality=90)
                        listing.write("file '" + str(frame_path) + "'\n")
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            result = subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(manifest),
                 "-r", str(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", str(target)],
                capture_output=True, text=True, timeout=300
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr[-1200:])
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(500, "No se pudo renderizar la animación 2D: " + str(exc)[:450])

    now = datetime.now(timezone.utc).isoformat()
    with connect() as c:
        cur = c.execute(
            "INSERT INTO studio_videos(title,description,filename,media_type,size_bytes,status,created_at) VALUES(?,?,?,?,?,?,?)",
            (req.title[:180], req.prompt[:4000], filename, "video/mp4", target.stat().st_size, "review", now)
        )
        video_id = cur.lastrowid
    return {
        "video_id": video_id,
        "title": req.title,
        "scenes": len(scenes),
        "duration_seconds": len(scenes) * req.seconds_per_scene,
        "filename": filename,
        "library_url": f"/api/studio/videos/{video_id}/file",
        "download_url": "/api/studio/renders/" + filename,
        "scene_descriptions": descriptions,
        "status": "review"
    }


@router.get("/subtitles/{filename}")
def download_subtitles(filename: str):
    from fastapi.responses import FileResponse
    if not filename.endswith(".srt") or Path(filename).name != filename:
        raise HTTPException(400, "Nombre de archivo no válido.")
    path = RENDER_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "Subtítulos no encontrados.")
    return FileResponse(path, media_type="application/x-subrip", filename=filename)


@router.get("/renders/{filename}")
def download_render(filename: str):
    from fastapi.responses import FileResponse
    if not filename.endswith(".mp4") or Path(filename).name != filename:
        raise HTTPException(400, "Nombre de archivo no válido.")
    path = RENDER_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "MP4 no encontrado.")
    return FileResponse(path, media_type="video/mp4", filename=filename)
