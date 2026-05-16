import json
from typing import Any

from sqlalchemy.orm import Session

from app.modules.audit.models import AuditEntry


def _serialize(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def log_event(
    db: Session,
    *,
    action_type: str,
    object_type: str,
    object_id: int | str | None = None,
    previous_value: Any = None,
    new_value: Any = None,
    initiator_id: int | None = None,
) -> AuditEntry:
    entry = AuditEntry(
        action_type=action_type,
        object_type=object_type,
        object_id=str(object_id) if object_id is not None else None,
        previous_value=_serialize(previous_value),
        new_value=_serialize(new_value),
        initiator_id=initiator_id,
    )
    db.add(entry)
    db.flush()
    return entry
