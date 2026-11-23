import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
import requests
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from services.auth_dependencies import get_current_user
from database import get_db
from models import Usuario
from schemas import (
    GoogleAuthRequest,
    SenhaConfirmacao,
    TokenResponse,
    UsuarioCreate,
    UsuarioLogin,
    UsuarioResponse,
    UsuarioUpdate,
)
from security import SECRET_KEY, create_access_token, generate_hash, verify_password

router = APIRouter()
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()
GOOGLE_STATE_COOKIE = "conecta_google_state"
GOOGLE_STATE_TTL = 600
GOOGLE_CALLBACK_PATH = "/auth/google/callback"

def google_oauth_state_secret() -> bytes:
    secret_key = SECRET_KEY
    if not secret_key:
        raise RuntimeError("SECRET_KEY must be configured for Google OAuth state")
    return secret_key.encode("utf-8")


def google_oauth_is_configured() -> bool:
    return all(
        (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, FRONTEND_URL)
    )


def sign_google_oauth_state(state: str, nonce: str, tipo_usuario: str | None) -> str:
    payload = json.dumps({
        "state": state,
        "nonce": nonce,
        "tipo_usuario": tipo_usuario,
        "expires_at": int(time.time()) + GOOGLE_STATE_TTL,
    }, separators=(",", ":")).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    signature = hmac.new(
        google_oauth_state_secret(),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def verify_google_oauth_state(cookie: str | None) -> dict[str, Any] | None:
    if not cookie:
        return None
    try:
        encoded_payload, signature = cookie.rsplit(".", 1)
        expected_signature = hmac.new(
            google_oauth_state_secret(),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            return None
        payload_bytes = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        payload = json.loads(payload_bytes)
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None

    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("state"), str)
        or not isinstance(payload.get("nonce"), str)
        or not isinstance(payload.get("expires_at"), int)
        or payload["expires_at"] < int(time.time())
        or payload.get("tipo_usuario") not in (None, "estudante", "professor")
    ):
        return None
    return payload


def google_redirect_response(result: str) -> RedirectResponse:
    response = RedirectResponse(
        f"{FRONTEND_URL.rstrip('/')}/#{result}",
        status_code=status.HTTP_303_SEE_OTHER,
    )
    response.delete_cookie(
        GOOGLE_STATE_COOKIE,
        path=GOOGLE_CALLBACK_PATH,
        secure=GOOGLE_REDIRECT_URI.startswith("https://"),
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

def verify_google_credential(credential: str) -> dict[str, Any]:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="O login Google ainda não foi configurado no servidor.",
        )
    try:
        claims = id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A credencial do Google é inválida ou expirou.",
        ) from error
    except GoogleAuthError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível verificar a credencial com o Google.",
        ) from error

    if claims.get("email_verified") is not True:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Confirme seu e-mail na conta Google antes de continuar.",
        )
    if not all(
        isinstance(claims.get(key), str) and claims[key].strip()
        for key in ("sub", "email", "name")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A conta Google não forneceu nome, e-mail ou identificador válidos.",
        )
    return dict(claims)


def create_user_token_response(user: Usuario) -> dict[str, Any]:
    access_token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "nome": user.nome,
        "tipo_usuario": user.tipo_usuario,
    })
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "usuario": user,
    }


def get_or_create_google_user(
    claims: dict[str, Any],
    tipo_usuario: str | None,
    db: Session,
) -> Usuario:
    google_sub = claims["sub"]
    email = claims["email"].strip().lower()
    user = db.scalar(select(Usuario).where(Usuario.google_sub == google_sub))

    if user is None:
        user = db.scalar(
            select(Usuario).where(func.lower(Usuario.email) == email)
        )
        if user is not None and user.google_sub not in (None, google_sub):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este e-mail já está vinculado a outra conta Google.",
            )
        if user is None:
            if tipo_usuario is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conta não encontrada. Selecione Cadastro e escolha Aluno ou Professor.",
                )
            user = Usuario(
                nome=claims["name"].strip(),
                email=email,
                senha_hash=generate_hash(secrets.token_urlsafe(32)),
                has_password=False,
                google_sub=google_sub,
                tipo_usuario=tipo_usuario,
            )
            db.add(user)
        else:
            user.google_sub = google_sub

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível vincular esta conta Google. Tente entrar novamente.",
        ) from error
    return user

@router.post("/auth/cadastrar", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def register_user(data: UsuarioCreate, db: Session = Depends(get_db)):
    existing_user = db.scalar(
        select(Usuario).where(Usuario.email == data.email)
    )
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esse e-mail já está em uso. Tente fazer login ou use outro e-mail.")

    hashed_password = generate_hash(data.senha)
    new_user = Usuario(nome=data.nome, email=data.email, senha_hash=hashed_password, tipo_usuario=data.tipo_usuario)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/auth/login", response_model=TokenResponse)
async def login_user(data: UsuarioLogin, db: Session = Depends(get_db)):
    user = db.scalar(
        select(Usuario).where(Usuario.email == data.email)
    )
    if (
        user is None
        or not user.has_password
        or not verify_password(data.senha, user.senha_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos.", headers={"WWW-Authenticate": "Bearer"})

    return create_user_token_response(user)


@router.get("/auth/google/start")
async def start_google_auth( tipo_usuario: Literal["professor", "estudante"] | None = None, ):
    if not google_oauth_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
                "GOOGLE_REDIRECT_URI e FRONTEND_URL no backend."
            ),
        )

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    params = urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
    })
    response = RedirectResponse(
        f"https://accounts.google.com/o/oauth2/v2/auth?{params}",
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        GOOGLE_STATE_COOKIE,
        sign_google_oauth_state(state, nonce, tipo_usuario),
        max_age=GOOGLE_STATE_TTL,
        path=GOOGLE_CALLBACK_PATH,
        secure=GOOGLE_REDIRECT_URI.startswith("https://"),
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/auth/google/callback")
def google_auth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if not google_oauth_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A configuração de OAuth do Google está incompleta no backend.",
        )

    oauth_state = verify_google_oauth_state(
        request.cookies.get(GOOGLE_STATE_COOKIE)
    )
    if (
        oauth_state is None
        or state is None
        or not hmac.compare_digest(state, oauth_state["state"])
    ):
        return google_redirect_response("google_error=state")
    if error or code is None:
        return google_redirect_response("google_error=cancelled")

    try:
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_response.raise_for_status()
        token_data = token_response.json()
    except (requests.RequestException, ValueError):
        return google_redirect_response("google_error=exchange")

    if not isinstance(token_data, dict) or not isinstance(
        token_data.get("id_token"), str
    ):
        return google_redirect_response("google_error=credential")
    try:
        claims = verify_google_credential(token_data["id_token"])
    except HTTPException:
        return google_redirect_response("google_error=credential")
    if (
        not isinstance(claims.get("nonce"), str)
        or not hmac.compare_digest(claims["nonce"], oauth_state["nonce"])
    ):
        return google_redirect_response("google_error=state")

    try:
        user = get_or_create_google_user(
            claims,
            oauth_state["tipo_usuario"],
            db,
        )
    except HTTPException as error_response:
        if error_response.status_code == status.HTTP_404_NOT_FOUND:
            return google_redirect_response("google_error=register")
        if error_response.status_code == status.HTTP_409_CONFLICT:
            return google_redirect_response("google_error=account")
        raise

    token = create_user_token_response(user)["access_token"]
    return google_redirect_response(f"google_access_token={token}")


@router.post("/auth/google", response_model=TokenResponse)
async def authenticate_google(
    data: GoogleAuthRequest,
    db: Session = Depends(get_db),
):
    claims = verify_google_credential(data.credential)
    user = get_or_create_google_user(claims, data.tipo_usuario, db)
    return create_user_token_response(user)


@router.get("/auth/me", response_model=UsuarioResponse)
async def get_my_profile(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.put("/auth/me", response_model=UsuarioResponse)
async def update_my_profile(
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    email_owner = db.scalar(
        select(Usuario).where(
            Usuario.email == data.email,
            Usuario.id != current_user.id,
        )
    )
    if email_owner is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esse e-mail já está em uso. Use outro e-mail.",
        )

    current_user.nome = data.nome
    current_user.email = data.email
    if data.senha:
        current_user.senha_hash = generate_hash(data.senha)
        current_user.has_password = True
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/auth/me")
async def delete_my_profile(
    data: SenhaConfirmacao,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.has_password and (
        data.senha is None
        or not verify_password(data.senha, current_user.senha_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A senha atual está incorreta.",
        )
    if not current_user.has_password and not current_user.google_sub:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não foi possível confirmar a autenticação desta conta.",
        )
    db.delete(current_user)
    db.commit()
    return {"status": "success"}
