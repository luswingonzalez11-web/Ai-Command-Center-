"""Read-only operational diagnostics. Never returns secret values."""
import importlib.util
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/ops", tags=["Operations"])
BASE = Path(__file__).resolve().parent
PROVIDERS = {"openai":"OPENAI_API_KEY","claude":"ANTHROPIC_API_KEY","gemini":"GEMINI_API_KEY","deepseek":"DEEPSEEK_API_KEY","grok":"XAI_API_KEY"}

def _database_status(path: Path) -> dict:
    if not path.exists():
        return {"status":"not_initialized"}
    try:
        with sqlite3.connect(str(path), timeout=2) as connection:
            result = connection.execute("PRAGMA quick_check").fetchone()
        return {"status":"ok" if result and result[0] == "ok" else "degraded"}
    except (sqlite3.Error, OSError):
        return {"status":"degraded"}

def _dependency_status(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False

@router.get("/health")
def operations_health():
    return {"status":"ok","service":"JARVIS CORE API","checked_at":datetime.now(timezone.utc).isoformat()}

@router.get("/diagnostics")
def operations_diagnostics():
    core = _database_status(BASE / "jarvis.db")
    studio = _database_status(BASE / "jarvis_studio.db")
    providers = [{"id":name,"configured":bool(os.getenv(variable))} for name,variable in PROVIDERS.items()]
    storage = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    databases_ok = all(x["status"] in ("ok","not_initialized") for x in (core,studio))
    return {
        "service":"JARVIS CORE","checked_at":datetime.now(timezone.utc).isoformat(),
        "overall":"operational" if databases_ok else "degraded",
        "databases":{"core":core,"studio":studio},"providers":providers,
        "integrations":{"supabase_storage_configured":storage,"github_token_configured":bool(os.getenv("GITHUB_TOKEN")),"developer_admin_token_configured":bool(os.getenv("JARVIS_ADMIN_TOKEN"))},
        "engines":{"video_render":_dependency_status("PIL") and _dependency_status("imageio_ffmpeg"),"svg_animation":_dependency_status("cairosvg"),"voice_generation":_dependency_status("edge_tts")},
        "security":{"cors_credentials_enabled":False,"secret_values_exposed":False,"note":"Configuration presence only; provider connectivity and OAuth permissions are not tested."}
    }
