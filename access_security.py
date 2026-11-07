import os, sqlite3, secrets, hashlib, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/access", tags=["private-access"])
DB_PATH = Path(os.getenv("JARVIS_DB_PATH", str(Path(__file__).resolve().parent / "jarvis.db")))

def now_utc():
    return datetime.now(timezone.utc)

def stamp(value):
    return value.isoformat()

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS access_requests (
            id TEXT PRIMARY KEY, display_name TEXT NOT NULL, code_hash TEXT NOT NULL,
            code_value TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'issued', ip_hash TEXT NOT NULL, session_id TEXT)""")
        conn.execute("""CREATE TABLE IF NOT EXISTS access_sessions (
            id TEXT PRIMARY KEY, request_id TEXT NOT NULL, token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_access_requests_ip ON access_requests(ip_hash, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_access_sessions_token ON access_sessions(token_hash)")

init_db()

def check_admin(token: Optional[str]):
    expected = os.getenv("JARVIS_ADMIN_TOKEN", "")
    if not expected:
        raise HTTPException(503, "Falta configurar JARVIS_ADMIN_TOKEN en Render.")
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(403, "Acceso de administrador denegado.")

def is_valid_guest_session(token: str):
    if not token: return False
    try:
        with connect() as conn:
            row = conn.execute("SELECT id FROM access_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
                               (digest(token), stamp(now_utc()))).fetchone()
        return row is not None
    except Exception:
        return False

class AccessRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
class RedeemRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)
class AdminVerifyRequest(BaseModel):
    admin_token: str = Field(min_length=1, max_length=500)

@router.post("/request")
def request_access(req: AccessRequest, request: Request):
    name = " ".join(req.display_name.strip().split())
    if not name: raise HTTPException(400, "Escribe un nombre para identificar la solicitud.")
    ip = request.client.host if request.client else "unknown"
    ip_hash = digest(ip + os.getenv("JARVIS_ADMIN_TOKEN", "rate-limit"))
    now = now_utc()
    with connect() as conn:
        recent = conn.execute("SELECT COUNT(*) AS total FROM access_requests WHERE ip_hash=? AND created_at>=?",
                              (ip_hash, stamp(now - timedelta(hours=1)))).fetchone()["total"]
        if recent >= 5: raise HTTPException(429, "Demasiadas solicitudes. Inténtalo más tarde.")
        code = f"{secrets.randbelow(100_000_000):08d}"
        request_id = str(uuid.uuid4())
        expires = now + timedelta(minutes=10)
        conn.execute("""INSERT INTO access_requests(id,display_name,code_hash,code_value,created_at,expires_at,status,ip_hash)
                        VALUES(?,?,?,?,?,?,'issued',?)""",
                     (request_id,name,digest(code),code,stamp(now),stamp(expires),ip_hash))
    return {"request_id":request_id,"code":code,"expires_at":stamp(expires),
            "message":"Código generado automáticamente y notificación enviada al panel de administrador."}

@router.get("/status/{request_id}")
def access_status(request_id: str):
    with connect() as conn:
        row = conn.execute("SELECT status,expires_at FROM access_requests WHERE id=?", (request_id,)).fetchone()
    if not row: raise HTTPException(404, "Solicitud no encontrada.")
    status = row["status"]
    if status == "issued" and row["expires_at"] <= stamp(now_utc()): status = "expired"
    return {"status":status,"expires_at":row["expires_at"]}

@router.post("/redeem")
def redeem_code(req: RedeemRequest):
    code = req.code.strip()
    if not code.isdigit(): raise HTTPException(400, "El código debe contener solo números.")
    now = now_utc()
    with connect() as conn:
        row = conn.execute("SELECT id,expires_at,status FROM access_requests WHERE code_hash=?", (digest(code),)).fetchone()
        if not row or row["status"] != "issued" or row["expires_at"] <= stamp(now):
            raise HTTPException(403, "Código incorrecto, vencido o ya utilizado.")
        token = secrets.token_urlsafe(40)
        sid = str(uuid.uuid4())
        expiry = now + timedelta(days=30)
        conn.execute("INSERT INTO access_sessions(id,request_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)",
                     (sid,row["id"],digest(token),stamp(now),stamp(expiry)))
        conn.execute("UPDATE access_requests SET status='redeemed',code_value=NULL,session_id=? WHERE id=?", (sid,row["id"]))
    return {"access_token":token,"role":"guest","expires_at":stamp(expiry)}

@router.post("/verify-admin")
def verify_admin(req: AdminVerifyRequest):
    check_admin(req.admin_token)
    return {"valid":True,"role":"admin"}

@router.get("/session")
def verify_session(authorization: Optional[str] = Header(default=None)):
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not is_valid_guest_session(token): raise HTTPException(401, "Sesión invitada vencida o revocada.")
    return {"valid":True,"role":"guest"}

@router.get("/admin/requests")
def list_requests(x_jarvis_admin_token: Optional[str] = Header(default=None)):
    check_admin(x_jarvis_admin_token)
    now = stamp(now_utc())
    with connect() as conn:
        conn.execute("UPDATE access_requests SET status='expired',code_value=NULL WHERE status='issued' AND expires_at<=?", (now,))
        rows = conn.execute("SELECT id,display_name,code_value,created_at,expires_at,status FROM access_requests ORDER BY created_at DESC LIMIT 100").fetchall()
    return [dict(row) for row in rows]

@router.post("/admin/revoke/{request_id}")
def revoke_access(request_id: str, x_jarvis_admin_token: Optional[str] = Header(default=None)):
    check_admin(x_jarvis_admin_token)
    with connect() as conn:
        row = conn.execute("SELECT id,session_id FROM access_requests WHERE id=?", (request_id,)).fetchone()
        if not row: raise HTTPException(404, "Acceso no encontrado.")
        if row["session_id"]:
            conn.execute("UPDATE access_sessions SET revoked_at=? WHERE id=?", (stamp(now_utc()),row["session_id"]))
        conn.execute("UPDATE access_requests SET status='revoked',code_value=NULL WHERE id=?", (request_id,))
    return {"revoked":True}
