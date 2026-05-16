from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.security import SESSION_COOKIE_NAME
from app.modules.users import service
from app.modules.users.models import User, UserSession
from app.modules.users.schemas import LoginRequest, UserCreate, UserRead, UserUpdate

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


@auth_router.post("/login", response_model=UserRead)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = service.authenticate(db, payload.email, payload.password)
    session = service.create_session(db, user)
    db.commit()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session.session_id,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        max_age=settings.SESSION_TTL_HOURS * 3600,
    )
    db.refresh(user)
    return user


@auth_router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    session_id: str | None = None,
):
    # session_id передан через cookie в get_current_user; здесь просто чистим всё для user
    db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"status": "ok"}


@auth_router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@users_router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("administrator")),
):
    return service.list_users(db)


@users_router.post("", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("administrator")),
):
    user = service.create_user(db, payload, initiator_id=initiator.id)
    db.commit()
    db.refresh(user)
    return user


@users_router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("administrator")),
):
    user = service.update_user(db, user_id, payload, initiator_id=initiator.id)
    db.commit()
    db.refresh(user)
    return user


@users_router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("administrator")),
):
    service.delete_user(db, user_id, initiator_id=initiator.id)
    db.commit()
    return None
