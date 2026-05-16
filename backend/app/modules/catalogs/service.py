from fastapi import HTTPException
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.audit import service as audit_service
from app.modules.catalogs.models import (
    Category,
    Consequence,
    Department,
    FunnelStage,
    IncidentTemplate,
    Severity,
    Source,
)
from app.modules.incidents.models import Incident, incident_consequences

# Соответствие справочника и FK-поля в incidents
INCIDENT_FK_MAP = {
    "departments": "department_id",
    "categories": "category_id",
    "severities": "severity_id",
    "sources": "source_id",
    "funnel_stages": "funnel_stage_id",
}

# Справочники, где FK NOT NULL — замена обязательна
REQUIRES_REPLACEMENT = {"departments", "funnel_stages"}


def get_usage(db: Session, name: str, item_id: int) -> int:
    """Возвращает количество ссылок из инцидентов на элемент справочника."""
    if name in INCIDENT_FK_MAP:
        col = getattr(Incident, INCIDENT_FK_MAP[name])
        return int(db.scalar(select(func.count(Incident.id)).where(col == item_id)) or 0)
    if name == "consequences":
        return int(
            db.scalar(
                select(func.count())
                .select_from(incident_consequences)
                .where(incident_consequences.c.consequence_id == item_id)
            )
            or 0
        )
    return 0

CATALOG_MAP = {
    "departments": Department,
    "severities": Severity,
    "categories": Category,
    "sources": Source,
    "funnel_stages": FunnelStage,
    "consequences": Consequence,
}


def get_model(name: str):
    model = CATALOG_MAP.get(name)
    if not model:
        raise HTTPException(status_code=404, detail=f"Справочник {name} не найден")
    return model


def list_items(db: Session, name: str, only_active: bool = False):
    model = get_model(name)
    stmt = select(model)
    if only_active:
        stmt = stmt.where(model.is_active.is_(True))
    if hasattr(model, "order_number"):
        stmt = stmt.order_by(model.order_number, model.name)
    else:
        stmt = stmt.order_by(model.name)
    return list(db.scalars(stmt))


def create_item(db: Session, name: str, data: dict, initiator_id: int | None = None):
    model = get_model(name)
    cleaned = {k: v for k, v in data.items() if v is not None and hasattr(model, k)}
    item = model(**cleaned)
    db.add(item)
    db.flush()
    audit_service.log_event(
        db,
        action_type="create",
        object_type=f"catalog.{name}",
        object_id=item.id,
        new_value=cleaned,
        initiator_id=initiator_id,
    )
    return item


def update_item(
    db: Session, name: str, item_id: int, data: dict, initiator_id: int | None = None
):
    model = get_model(name)
    item = db.get(model, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")
    previous = {
        c.name: getattr(item, c.name) for c in model.__table__.columns if c.name != "id"
    }
    for field, value in data.items():
        if value is None or not hasattr(item, field):
            continue
        setattr(item, field, value)
    db.flush()
    new = {c.name: getattr(item, c.name) for c in model.__table__.columns if c.name != "id"}
    audit_service.log_event(
        db,
        action_type="update",
        object_type=f"catalog.{name}",
        object_id=item.id,
        previous_value=previous,
        new_value=new,
        initiator_id=initiator_id,
    )
    return item


def _merge_incident_references(
    db: Session, name: str, old_id: int, new_id: int | None
) -> int:
    """Переносит ссылки инцидентов с old_id на new_id (или NULL).

    Возвращает число изменённых строк.
    """
    if name in INCIDENT_FK_MAP:
        col_name = INCIDENT_FK_MAP[name]
        col = getattr(Incident, col_name)
        result = db.execute(
            update(Incident).where(col == old_id).values(**{col_name: new_id})
        )
        return result.rowcount or 0

    if name == "consequences":
        if new_id is None:
            # Просто удаляем все связи M2M
            result = db.execute(
                delete(incident_consequences).where(
                    incident_consequences.c.consequence_id == old_id
                )
            )
            return result.rowcount or 0

        # Иначе переименовываем links со старого на новый, обходя дубликаты
        existing_with_new = set(
            db.execute(
                select(incident_consequences.c.incident_id).where(
                    incident_consequences.c.consequence_id == new_id
                )
            ).scalars().all()
        )
        old_link_incidents = (
            db.execute(
                select(incident_consequences.c.incident_id).where(
                    incident_consequences.c.consequence_id == old_id
                )
            ).scalars().all()
        )

        duplicates = [iid for iid in old_link_incidents if iid in existing_with_new]
        non_dupes = [iid for iid in old_link_incidents if iid not in existing_with_new]

        if duplicates:
            db.execute(
                delete(incident_consequences).where(
                    and_(
                        incident_consequences.c.consequence_id == old_id,
                        incident_consequences.c.incident_id.in_(duplicates),
                    )
                )
            )
        if non_dupes:
            db.execute(
                update(incident_consequences)
                .where(
                    and_(
                        incident_consequences.c.consequence_id == old_id,
                        incident_consequences.c.incident_id.in_(non_dupes),
                    )
                )
                .values(consequence_id=new_id)
            )
        return len(old_link_incidents)

    return 0


def delete_item(
    db: Session,
    name: str,
    item_id: int,
    initiator_id: int | None = None,
    replace_with: int | None = None,
):
    model = get_model(name)
    item = db.get(model, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")

    if replace_with is not None and replace_with == item_id:
        raise HTTPException(
            status_code=400, detail="Нельзя заменить элемент на самого себя"
        )

    snapshot = {
        c.name: getattr(item, c.name) for c in model.__table__.columns if c.name != "id"
    }
    refs = get_usage(db, name, item_id)

    # Если есть ссылки — обрабатываем перенос
    affected = 0
    if refs > 0:
        if name in REQUIRES_REPLACEMENT and replace_with is None:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": (
                        f"На «{snapshot.get('name', item_id)}» ссылается "
                        f"{refs} инцидент(ов). Укажите элемент, на который заменить."
                    ),
                    "references": refs,
                    "requires_replacement": True,
                },
            )

        if replace_with is not None:
            replacement = db.get(model, replace_with)
            if not replacement:
                raise HTTPException(
                    status_code=400, detail="Замещающий элемент не найден"
                )

        affected = _merge_incident_references(db, name, item_id, replace_with)

        audit_service.log_event(
            db,
            action_type="merge_delete",
            object_type=f"catalog.{name}",
            object_id=item_id,
            previous_value={
                **snapshot,
                "affected_count": affected,
                "replaced_with_id": replace_with,
            },
            initiator_id=initiator_id,
        )
    else:
        audit_service.log_event(
            db,
            action_type="delete",
            object_type=f"catalog.{name}",
            object_id=item_id,
            previous_value=snapshot,
            initiator_id=initiator_id,
        )

    db.delete(item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=(
                f"Не удалось удалить «{snapshot.get('name', item_id)}»: "
                "остались ссылки из других объектов."
            ),
        )


def list_templates(
    db: Session,
    user_id: int,
    role: str,
    only_active: bool = False,
    only_mine: bool = False,
):
    """Менеджер видит свои + глобальные, админ видит все.

    only_mine = True → только свои (для управления "мои шаблоны")
    """
    stmt = select(IncidentTemplate)
    if only_active:
        stmt = stmt.where(IncidentTemplate.is_active.is_(True))
    if only_mine:
        stmt = stmt.where(IncidentTemplate.owner_id == user_id)
    elif role == "manager":
        stmt = stmt.where(
            or_(IncidentTemplate.owner_id == user_id, IncidentTemplate.owner_id.is_(None))
        )
    stmt = stmt.order_by(IncidentTemplate.name)
    return list(db.scalars(stmt))


def create_template(db: Session, data: dict, role: str, initiator_id: int):
    cleaned = {k: v for k, v in data.items() if v is not None}
    # Менеджер создаёт личный шаблон, админ — глобальный
    cleaned["owner_id"] = initiator_id if role == "manager" else None
    template = IncidentTemplate(**cleaned)
    db.add(template)
    db.flush()
    audit_service.log_event(
        db,
        action_type="create",
        object_type="incident_template",
        object_id=template.id,
        new_value=cleaned,
        initiator_id=initiator_id,
    )
    return template


def _check_template_ownership(template: IncidentTemplate, user_id: int, role: str) -> None:
    if role == "administrator":
        return
    if template.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Можно редактировать только свои шаблоны")


def update_template(
    db: Session, template_id: int, data: dict, role: str, initiator_id: int
):
    template = db.get(IncidentTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    _check_template_ownership(template, initiator_id, role)
    previous = {
        c.name: getattr(template, c.name)
        for c in IncidentTemplate.__table__.columns
        if c.name != "id"
    }
    for field, value in data.items():
        if value is None or field == "owner_id":  # owner_id нельзя менять
            continue
        setattr(template, field, value)
    db.flush()
    new = {
        c.name: getattr(template, c.name)
        for c in IncidentTemplate.__table__.columns
        if c.name != "id"
    }
    audit_service.log_event(
        db,
        action_type="update",
        object_type="incident_template",
        object_id=template.id,
        previous_value=previous,
        new_value=new,
        initiator_id=initiator_id,
    )
    return template


def delete_template(db: Session, template_id: int, role: str, initiator_id: int):
    template = db.get(IncidentTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    _check_template_ownership(template, initiator_id, role)
    audit_service.log_event(
        db,
        action_type="delete",
        object_type="incident_template",
        object_id=template.id,
        previous_value={"name": template.name, "owner_id": template.owner_id},
        initiator_id=initiator_id,
    )
    db.delete(template)
    db.flush()
