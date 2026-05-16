from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    generate_session_token,
    hash_password,
    verify_password,
)
from app.modules.audit import service as audit_service
from app.modules.users.models import User, UserSession
from app.modules.users.schemas import UserCreate, UserUpdate


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    if user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись заблокирована",
        )
    return user


def create_session(db: Session, user: User) -> UserSession:
    session = UserSession(
        session_id=generate_session_token(),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_TTL_HOURS),
    )
    db.add(session)
    db.flush()
    return session


def delete_session(db: Session, session_id: str) -> None:
    db.query(UserSession).filter(UserSession.session_id == session_id).delete()


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


def create_user(db: Session, payload: UserCreate, initiator_id: int | None = None) -> User:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        department_id=payload.department_id,
    )
    db.add(user)
    db.flush()
    audit_service.log_event(
        db,
        action_type="create",
        object_type="user",
        object_id=user.id,
        new_value={
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "department_id": user.department_id,
        },
        initiator_id=initiator_id,
    )
    return user


def delete_user(db: Session, user_id: int, initiator_id: int):
    if user_id == initiator_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить собственную учётную запись",
        )
    user = get_user(db, user_id)
    snapshot = {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "department_id": user.department_id,
        "is_blocked": user.is_blocked,
    }

    audit_service.log_event(
        db,
        action_type="delete",
        object_type="user",
        object_id=user.id,
        previous_value=snapshot,
        initiator_id=initiator_id,
    )

    db.delete(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Невозможно удалить «{snapshot['full_name']}»: "
                "у этого пользователя есть зарегистрированные инциденты, комментарии, "
                "вложения или записи в журнале аудита. Заблокируйте учётную запись "
                "вместо удаления (is_blocked = true)."
            ),
        )


def update_user(
    db: Session, user_id: int, payload: UserUpdate, initiator_id: int | None = None
) -> User:
    user = get_user(db, user_id)
    previous = {
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "department_id": user.department_id,
        "is_blocked": user.is_blocked,
    }
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if payload.role is not None:
        user.role = payload.role
    if payload.department_id is not None:
        user.department_id = payload.department_id
    if payload.is_blocked is not None:
        user.is_blocked = payload.is_blocked
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    db.flush()
    audit_service.log_event(
        db,
        action_type="update",
        object_type="user",
        object_id=user.id,
        previous_value=previous,
        new_value={
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "department_id": user.department_id,
            "is_blocked": user.is_blocked,
        },
        initiator_id=initiator_id,
    )
    return user
