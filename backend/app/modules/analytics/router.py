from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role
from app.modules.analytics import service
from app.modules.users.models import User

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard(
    period_from: datetime | None = None,
    period_to: datetime | None = None,
    department_id: int | None = None,
    category_id: int | None = None,
    severity_id: int | None = None,
    source_id: int | None = None,
    funnel_stage_id: int | None = None,
    consequence_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("supervisor", "administrator")),
):
    if period_to is None:
        period_to = datetime.now(timezone.utc)
    if period_from is None:
        period_from = period_to - timedelta(days=30)
    return service.build_dashboard(
        db,
        period_from,
        period_to,
        department_id=department_id,
        category_id=category_id,
        severity_id=severity_id,
        source_id=source_id,
        funnel_stage_id=funnel_stage_id,
        consequence_id=consequence_id,
    )
