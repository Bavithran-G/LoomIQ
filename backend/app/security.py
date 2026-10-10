from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import Role, User

ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=config.ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": str(user.id), "role": user.role.value, "exp": exp},
                      config.SECRET_KEY, algorithm=ALGORITHM)


def current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    cred_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                             headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise cred_exc
    user = db.get(User, uid)
    if not user or not user.is_active:
        raise cred_exc
    return user


# ---- Permission matrix (enforced server-side on every route) ----
R = Role
PERMISSIONS: dict[str, set[Role]] = {
    "dashboard.view": {R.admin, R.production_manager, R.storekeeper, R.quality_inspector, R.dispatch_operator, R.finance},
    "orders.view": {R.admin, R.production_manager, R.storekeeper, R.quality_inspector, R.dispatch_operator, R.finance},
    "orders.manage": {R.admin, R.production_manager},
    "inventory.view": {R.admin, R.production_manager, R.storekeeper, R.finance},
    "inventory.manage": {R.admin, R.storekeeper},
    "production.view": {R.admin, R.production_manager, R.storekeeper, R.quality_inspector, R.dispatch_operator, R.finance},
    "production.manage": {R.admin, R.production_manager},
    "machines.manage": {R.admin, R.production_manager},
    "quality.view": {R.admin, R.production_manager, R.quality_inspector, R.dispatch_operator, R.finance},
    "quality.inspect": {R.admin, R.quality_inspector},          # upload / run analysis
    "quality.review": {R.admin, R.quality_inspector},           # authorised human decision
    "quality.disposition": {R.admin, R.production_manager, R.quality_inspector},  # rework done / scrap
    "rolls.view": {R.admin, R.production_manager, R.storekeeper, R.quality_inspector, R.dispatch_operator, R.finance},
    "dispatch.view": {R.admin, R.production_manager, R.dispatch_operator, R.finance},
    "dispatch.manage": {R.admin, R.dispatch_operator},
    "cost.view": {R.admin, R.production_manager, R.finance},
    "cost.manage": {R.admin, R.finance},
    "insights.view": {R.admin, R.production_manager, R.finance},
    "admin.manage": {R.admin},
    "portal.view": {R.buyer},
}


def require(perm: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in PERMISSIONS[perm]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Your role ({user.role.value}) cannot perform '{perm}'")
        return user
    return dep


def permissions_for(role: Role) -> list[str]:
    return sorted(p for p, roles in PERMISSIONS.items() if role in roles)
