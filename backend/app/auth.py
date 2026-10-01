import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

JWT_ALGO = "HS256"
TOKEN_DAYS = 30

bearer = HTTPBearer(auto_error=False)


def _secret() -> str:
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET doit faire au moins 32 caractères")
    return secret


def check_credentials(username: str, password: str) -> bool:
    user = os.environ.get("APP_USER", "")
    pwd = os.environ.get("APP_PASSWORD", "")
    if not user or not pwd:
        return False
    ok_user = hmac.compare_digest(username.encode(), user.encode())
    ok_pass = hmac.compare_digest(password.encode(), pwd.encode())
    return ok_user and ok_pass


def create_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": username, "iat": now, "exp": now + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGO)


def require_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise")
    try:
        payload = jwt.decode(creds.credentials, _secret(), algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée, reconnectez-vous")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide")
    return payload["sub"]
