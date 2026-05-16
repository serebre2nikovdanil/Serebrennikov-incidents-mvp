from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role
from app.modules.audit.models import AuditEntry
from app.modules.audit.schemas import AuditList
from app.modules.users.models import User

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/entries", response_model=AuditList)
def list_entries(
    initiator_id: int | None = None,
    action_type: str | None = None,
    object_type: str | None = None,
    period_from: datetime | None = None,
    period_to: datetime | None = None,
    offset: int = 0,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("administrator")),
):
    filters = []
    if initiator_id:
        filters.append(AuditEntry.initiator_id == initiator_id)
    if action_type:
        filters.append(AuditEntry.action_type == action_type)
    if object_type:
        filters.append(AuditEntry.object_type == object_type)
    if period_from:
        filters.append(AuditEntry.created_at >= period_from)
    if period_to:
        filters.append(AuditEntry.created_at <= period_to)

    stmt = select(AuditEntry).where(and_(*filters)) if filters else select(AuditEntry)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.order_by(AuditEntry.created_at.desc()).offset(offset).limit(limit)))
    return {"items": items, "total": total, "offset": offset, "limit": limit}
