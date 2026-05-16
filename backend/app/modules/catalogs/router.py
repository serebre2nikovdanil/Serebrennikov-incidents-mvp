from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.modules.catalogs import service
from app.modules.catalogs.schemas import (
    IncidentTemplateCreate,
    IncidentTemplateRead,
    IncidentTemplateUpdate,
)
from app.modules.users.models import User

router = APIRouter(prefix="/catalogs", tags=["catalogs"])
templates_router = APIRouter(prefix="/incident-templates", tags=["catalogs"])


@router.get("/{name}")
def list_items(
    name: str,
    only_active: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    items = service.list_items(db, name, only_active=only_active)
    return [
        {c.name: getattr(item, c.name) for c in item.__table__.columns}
        for item in items
    ]


@router.post("/{name}", status_code=201)
def create_item(
    name: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("administrator")),
):
    item = service.create_item(db, name, payload, initiator_id=initiator.id)
    db.commit()
    db.refresh(item)
    return {c.name: getattr(item, c.name) for c in item.__table__.columns}


@router.patch("/{name}/{item_id}")
def update_item(
    name: str,
    item_id: int,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("administrator")),
):
    item = service.update_item(db, name, item_id, payload, initiator_id=initiator.id)
    db.commit()
    db.refresh(item)
    return {c.name: getattr(item, c.name) for c in item.__table__.columns}


@router.get("/{name}/{item_id}/usage")
def get_usage(
    name: str,
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("administrator")),
):
    refs = service.get_usage(db, name, item_id)
    return {
        "references": refs,
        "requires_replacement": (name in service.REQUIRES_REPLACEMENT) and refs > 0,
        "is_m2m": name == "consequences",
        "supports_null": name not in service.REQUIRES_REPLACEMENT,
    }


@router.delete("/{name}/{item_id}", status_code=204)
def delete_item(
    name: str,
    item_id: int,
    replace_with: int | None = Query(default=None),
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("administrator")),
):
    service.delete_item(
        db, name, item_id, initiator_id=initiator.id, replace_with=replace_with
    )
    db.commit()
    return None


@templates_router.get("", response_model=list[IncidentTemplateRead])
def list_templates(
    only_active: bool = Query(default=False),
    only_mine: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return service.list_templates(
        db, user_id=user.id, role=user.role, only_active=only_active, only_mine=only_mine
    )


@templates_router.post("", response_model=IncidentTemplateRead, status_code=201)
def create_template(
    payload: IncidentTemplateCreate,
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("manager", "administrator")),
):
    template = service.create_template(
        db, payload.model_dump(), role=initiator.role, initiator_id=initiator.id
    )
    db.commit()
    db.refresh(template)
    return template


@templates_router.patch("/{template_id}", response_model=IncidentTemplateRead)
def update_template(
    template_id: int,
    payload: IncidentTemplateUpdate,
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("manager", "administrator")),
):
    template = service.update_template(
        db,
        template_id,
        payload.model_dump(exclude_unset=True),
        role=initiator.role,
        initiator_id=initiator.id,
    )
    db.commit()
    db.refresh(template)
    return template


@templates_router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    initiator: User = Depends(require_role("manager", "administrator")),
):
    service.delete_template(db, template_id, role=initiator.role, initiator_id=initiator.id)
    db.commit()
    return None
