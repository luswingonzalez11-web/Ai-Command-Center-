import os
import secrets
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/access", tags=["private-access"])


def now_utc():
    return datetime.now(timezone.utc)


def stamp(value):
    return value.isoformat()


def digest(value):
    pepper = os.getenv("JARVIS_ADMIN_TOKEN", "jarvis-local-pepper")
    return hashlib.sha256((pepper + value).encode("utf-8")).hexdigest()


def supabase_config():
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise HTTPException(503, "El almacenamiento seguro de accesos requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Render.")
    return base, key


async def db_request(method, table, params=None, payload=None, prefer=None):
    base, key = supabase_config()
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    if prefer:
        headers["Prefer"] = prefer
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(
                method,
                base + "/rest/v1/" + table,
                headers=headers,
                params=params,
                json=payload
            )
        if response.is_error:
            raise HTTPException(502, "El almacén de accesos rechazó la operación: " + response.text[:180])
        if response.status_code == 204 or not response.content:
            return []
        return response.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, "No se pudo conectar con el almacén seguro de accesos.")


def check_admin(token: Optional[str]):
    expected = os.getenv("JARVIS_ADMIN_TOKEN", "")
    if not expected:
        raise HTTPException(503, "Falta configurar JARVIS_ADMIN_TOKEN en Render.")
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(403, "Acceso de administrador denegado.")


async def is_valid_guest_session(token: str):
    if not token:
        return False
    rows = await db_request(
        "GET", "jarvis_access_sessions",
        params={
            "select": "id",
            "token_hash": "eq." + digest(token),
            "revoked_at": "is.null",
            "expires_at": "gt." + stamp(now_utc()),
            "limit": "1"
        }
    )
    return bool(rows)


class AccessRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)


class RedeemRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)


class AdminVerifyRequest(BaseModel):
    admin_token: str = Field(min_length=1, max_length=500)


@router.post("/request")
async def request_access(req: AccessRequest, request: Request):
    name = " ".join(req.display_name.strip().split())
    if not name:
        raise HTTPException(400, "Escribe un nombre para identificar la solicitud.")
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not ip:
        ip = request.client.host if request.client else "unknown"
    ip_hash = digest(ip)
    now = now_utc()
    recent = await db_request(
        "GET", "jarvis_access_requests",
        params={
            "select": "id",
            "ip_hash": "eq." + ip_hash,
            "created_at": "gte." + stamp(now - timedelta(hours=1)),
            "limit": "6"
        }
    )
    if len(recent) >= 5:
        raise HTTPException(429, "Demasiadas solicitudes. Inténtalo más tarde.")
    code = f"{secrets.randbelow(100_000_000):08d}"
    expires = now + timedelta(minutes=10)
    rows = await db_request(
        "POST", "jarvis_access_requests",
        payload={
            "display_name": name,
            "code_hash": digest(code),
            "code_value": code,
            "created_at": stamp(now),
            "expires_at": stamp(expires),
            "status": "issued",
            "ip_hash": ip_hash
        },
        prefer="return=representation"
    )
    if not rows:
        raise HTTPException(502, "No se pudo registrar la solicitud de acceso.")
    return {
        "request_id": rows[0]["id"],
        "code": code,
        "expires_at": stamp(expires),
        "message": "Código generado automáticamente y notificación enviada al panel de administrador."
    }


@router.get("/status/{request_id}")
async def access_status(request_id: str):
    rows = await db_request(
        "GET", "jarvis_access_requests",
        params={"select": "status,expires_at", "id": "eq." + request_id, "limit": "1"}
    )
    if not rows:
        raise HTTPException(404, "Solicitud no encontrada.")
    row = rows[0]
    status = row["status"]
    if status == "issued" and row["expires_at"] <= stamp(now_utc()):
        status = "expired"
    return {"status": status, "expires_at": row["expires_at"]}


@router.post("/redeem")
async def redeem_code(req: RedeemRequest):
    code = req.code.strip()
    if not code.isdigit():
        raise HTTPException(400, "El código debe contener solo números.")
    now = now_utc()
    rows = await db_request(
        "GET", "jarvis_access_requests",
        params={
            "select": "id,expires_at,status",
            "code_hash": "eq." + digest(code),
            "limit": "1"
        }
    )
    if not rows or rows[0]["status"] != "issued" or rows[0]["expires_at"] <= stamp(now):
        raise HTTPException(403, "Código incorrecto, vencido o ya utilizado.")
    request_id = rows[0]["id"]
    token = secrets.token_urlsafe(40)
    session_id = str(uuid.uuid4())
    session_expiry = now + timedelta(days=30)
    await db_request(
        "POST", "jarvis_access_sessions",
        payload={
            "id": session_id,
            "request_id": request_id,
            "token_hash": digest(token),
            "created_at": stamp(now),
            "expires_at": stamp(session_expiry)
        },
        prefer="return=minimal"
    )
    updated = await db_request(
        "PATCH", "jarvis_access_requests",
        params={
            "id": "eq." + request_id,
            "status": "eq.issued",
            "expires_at": "gt." + stamp(now),
            "select": "id"
        },
        payload={"status": "redeemed", "code_value": None, "session_id": session_id},
        prefer="return=representation"
    )
    if not updated:
        await db_request(
            "DELETE", "jarvis_access_sessions",
            params={"id": "eq." + session_id},
            prefer="return=minimal"
        )
        raise HTTPException(403, "El código ya fue utilizado o venció.")
    return {"access_token": token, "role": "guest", "expires_at": stamp(session_expiry)}


@router.post("/verify-admin")
def verify_admin(req: AdminVerifyRequest):
    check_admin(req.admin_token)
    return {"valid": True, "role": "admin"}


@router.get("/session")
async def verify_session(authorization: Optional[str] = Header(default=None)):
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not await is_valid_guest_session(token):
        raise HTTPException(401, "Sesión invitada vencida o revocada.")
    return {"valid": True, "role": "guest"}


@router.get("/admin/requests")
async def list_requests(x_jarvis_admin_token: Optional[str] = Header(default=None)):
    check_admin(x_jarvis_admin_token)
    now = stamp(now_utc())
    await db_request(
        "PATCH", "jarvis_access_requests",
        params={"status": "eq.issued", "expires_at": "lte." + now},
        payload={"status": "expired", "code_value": None},
        prefer="return=minimal"
    )
    return await db_request(
        "GET", "jarvis_access_requests",
        params={
            "select": "id,display_name,code_value,created_at,expires_at,status",
            "order": "created_at.desc",
            "limit": "100"
        }
    )


@router.post("/admin/revoke/{request_id}")
async def revoke_access(request_id: str, x_jarvis_admin_token: Optional[str] = Header(default=None)):
    check_admin(x_jarvis_admin_token)
    rows = await db_request(
        "GET", "jarvis_access_requests",
        params={"select": "id,session_id", "id": "eq." + request_id, "limit": "1"}
    )
    if not rows:
        raise HTTPException(404, "Acceso no encontrado.")
    session_id = rows[0].get("session_id")
    if session_id:
        await db_request(
            "PATCH", "jarvis_access_sessions",
            params={"id": "eq." + session_id},
            payload={"revoked_at": stamp(now_utc())},
            prefer="return=minimal"
        )
    await db_request(
        "PATCH", "jarvis_access_requests",
        params={"id": "eq." + request_id},
        payload={"status": "revoked", "code_value": None},
        prefer="return=minimal"
    )
    return {"revoked": True}
