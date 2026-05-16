from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.modules.audit import service as audit_service
from app.modules.catalogs.models import Consequence
from app.modules.incidents.lifecycle import validate_transition
from app.modules.incidents.models import (
    STATUS_REGISTERED,
    Attachment,
    Comment,
    Incident,
    StatusHistory,
)
from app.modules.notifications import service as notifications_service


def create_incident(db: Session, data: dict, initiator_id: int) -> Incident:
    consequence_ids = data.pop("consequence_ids", []) or []
    incident = Incident(
        description=data["description"],
        occured_at=data["occured_at"],
        department_id=data["department_id"],
        category_id=data.get("category_id"),
        severity_id=data.get("severity_id"),
        source_id=data.get("source_id"),
        funnel_stage_id=data["funnel_stage_id"],
        is_anonymous=data.get("is_anonymous", False),
        initiator_id=initiator_id,
        status=STATUS_REGISTERED,
    )
    if consequence_ids:
        incident.consequences = list(
            db.scalars(select(Consequence).where(Consequence.id.in_(consequence_ids)))
        )
    db.add(incident)
    db.flush()

    history = StatusHistory(
        incident_id=incident.id,
        previous_status=None,
        new_status=STATUS_REGISTERED,
        transition_reason=None,
        initiator_id=initiator_id,
    )
    db.add(history)

    audit_service.log_event(
        db,
        action_type="create",
        object_type="incident",
        object_id=incident.id,
        new_value={
            "description": incident.description,
            "department_id": incident.department_id,
            "category_id": incident.category_id,
            "severity_id": incident.severity_id,
            "source_id": incident.source_id,
            "funnel_stage_id": incident.funnel_stage_id,
            "is_anonymous": incident.is_anonymous,
        },
        initiator_id=initiator_id,
    )

    notifications_service.notify_new_incident(
        incident_id=incident.id, department_id=incident.department_id
    )
    return incident


def list_incidents(
    db: Session,
    *,
    department_id: int | None = None,
    category_id: int | None = None,
    source_id: int | None = None,
    severity_id: int | None = None,
    funnel_stage_id: int | None = None,
    status: str | None = None,
    initiator_id: int | None = None,
    period_from: datetime | None = None,
    period_to: datetime | None = None,
    keyword: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[Incident], int]:
    filters = []
    if department_id:
        filters.append(Incident.department_id == department_id)
    if category_id:
        filters.append(Incident.category_id == category_id)
    if source_id:
        filters.append(Incident.source_id == source_id)
    if severity_id:
        filters.append(Incident.severity_id == severity_id)
    if funnel_stage_id:
        filters.append(Incident.funnel_stage_id == funnel_stage_id)
    if status:
        filters.append(Incident.status == status)
    if initiator_id:
        filters.append(Incident.initiator_id == initiator_id)
    if period_from:
        filters.append(Incident.registered_at >= period_from)
    if period_to:
        filters.append(Incident.registered_at <= period_to)
    if keyword:
        filters.append(Incident.description.ilike(f"%{keyword}%"))

    stmt = select(Incident).where(and_(*filters)) if filters else select(Incident)
    total = db.scalar(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ) or 0
    items = list(
        db.scalars(stmt.order_by(Incident.registered_at.desc()).offset(offset).limit(limit))
    )
    return items, total


def get_incident(db: Session, incident_id: int) -> Incident:
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Инцидент не найден")
    return incident


def update_incident(
    db: Session, incident_id: int, data: dict, initiator_id: int, role: str
) -> Incident:
    incident = get_incident(db, incident_id)
    if role != "administrator" and incident.initiator_id != initiator_id:
        raise HTTPException(status_code=403, detail="Редактировать может только инициатор")
    previous = {
        "description": incident.description,
        "occured_at": incident.occured_at,
        "category_id": incident.category_id,
        "severity_id": incident.severity_id,
        "source_id": incident.source_id,
        "funnel_stage_id": incident.funnel_stage_id,
    }
    if data.get("description") is not None:
        incident.description = data["description"]
    if data.get("occured_at") is not None:
        incident.occured_at = data["occured_at"]
    if data.get("category_id") is not None:
        incident.category_id = data["category_id"]
    if data.get("severity_id") is not None:
        incident.severity_id = data["severity_id"]
    if data.get("source_id") is not None:
        incident.source_id = data["source_id"]
    if data.get("funnel_stage_id") is not None:
        incident.funnel_stage_id = data["funnel_stage_id"]
    if data.get("consequence_ids") is not None:
        incident.consequences = list(
            db.scalars(select(Consequence).where(Consequence.id.in_(data["consequence_ids"])))
        )
    db.flush()
    audit_service.log_event(
        db,
        action_type="update",
        object_type="incident",
        object_id=incident.id,
        previous_value=previous,
        new_value={
            "description": incident.description,
            "occured_at": incident.occured_at,
            "category_id": incident.category_id,
            "severity_id": incident.severity_id,
            "source_id": incident.source_id,
            "funnel_stage_id": incident.funnel_stage_id,
        },
        initiator_id=initiator_id,
    )
    return incident


def transition_incident(
    db: Session, incident_id: int, target_status: str, reason: str | None, initiator_id: int
) -> Incident:
    incident = get_incident(db, incident_id)
    previous_status = incident.status
    reason_field = validate_transition(previous_status, target_status, reason)
    incident.status = target_status
    if reason_field == "cancellation_reason":
        incident.cancellation_reason = reason
    elif reason_field == "reopening_reason":
        incident.reopening_reason = reason
    history = StatusHistory(
        incident_id=incident.id,
        previous_status=previous_status,
        new_status=target_status,
        transition_reason=reason,
        initiator_id=initiator_id,
    )
    db.add(history)
    db.flush()
    audit_service.log_event(
        db,
        action_type="transition",
        object_type="incident",
        object_id=incident.id,
        previous_value=previous_status,
        new_value=target_status,
        initiator_id=initiator_id,
    )
    notifications_service.notify_status_change(
        incident_id=incident.id, initiator_id=initiator_id, new_status=target_status
    )
    return incident


def add_comment(db: Session, incident_id: int, text: str, author_id: int) -> Comment:
    get_incident(db, incident_id)
    comment = Comment(incident_id=incident_id, text=text, author_id=author_id)
    db.add(comment)
    db.flush()
    audit_service.log_event(
        db,
        action_type="create",
        object_type="comment",
        object_id=comment.id,
        new_value={"incident_id": incident_id, "text": text[:200]},
        initiator_id=author_id,
    )
    return comment


def recent_values(db: Session, user_id: int) -> dict[str, list[int]]:
    """Возвращает последние 3 уникальных значения каждого поля у пользователя."""
    def _last_three(column) -> list[int]:
        rows = db.execute(
            select(column, func.max(Incident.registered_at).label("last"))
            .where(Incident.initiator_id == user_id)
            .group_by(column)
            .order_by(func.max(Incident.registered_at).desc())
            .limit(3)
        ).all()
        return [r[0] for r in rows]

    return {
        "category_ids": _last_three(Incident.category_id),
        "source_ids": _last_three(Incident.source_id),
        "funnel_stage_ids": _last_three(Incident.funnel_stage_id),
    }


def add_attachment_record(
    db: Session,
    *,
    incident_id: int,
    file_name: str,
    file_path: str,
    file_size: int,
    mime_type: str,
    uploader_id: int,
) -> Attachment:
    incident = get_incident(db, incident_id)
    if len(incident.attachments) >= 5:
        raise HTTPException(status_code=400, detail="Максимум 5 файлов на инцидент")
    att = Attachment(
        incident_id=incident_id,
        file_name=file_name,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        uploader_id=uploader_id,
    )
    db.add(att)
    db.flush()
    audit_service.log_event(
        db,
        action_type="create",
        object_type="attachment",
        object_id=att.id,
        new_value={"incident_id": incident_id, "file_name": file_name, "file_size": file_size},
        initiator_id=uploader_id,
    )
    return att


def _ref(obj) -> dict | None:
    if obj is None:
        return None
    return {"id": obj.id, "name": obj.name}


def serialize_for_response(incident: Incident, hide_initiator_if_anonymous: bool, viewer_id: int) -> dict[str, Any]:
    """Анонимизирует данные для чужих пользователей."""
    hide = hide_initiator_if_anonymous and incident.is_anonymous and incident.initiator_id != viewer_id
    return {
        "id": incident.id,
        "description": incident.description,
        "status": incident.status,
        "registered_at": incident.registered_at,
        "occured_at": incident.occured_at,
        "is_anonymous": incident.is_anonymous,
        "initiator": None if hide else {"id": incident.initiator.id, "full_name": incident.initiator.full_name},
        "department": _ref(incident.department),
        "category": _ref(incident.category),
        "severity": _ref(incident.severity),
        "source": _ref(incident.source),
        "funnel_stage": _ref(incident.funnel_stage),
        "cancellation_reason": incident.cancellation_reason,
        "reopening_reason": incident.reopening_reason,
        "consequences": [_ref(c) for c in incident.consequences],
        "status_history": incident.status_history,
        "comments": incident.comments,
        "attachments": incident.attachments,
    }
