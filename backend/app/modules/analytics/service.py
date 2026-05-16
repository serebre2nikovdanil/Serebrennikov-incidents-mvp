from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.modules.catalogs.models import (
    Category,
    Consequence,
    Department,
    FunnelStage,
    Severity,
    Source,
)
from app.modules.incidents.models import (
    STATUS_CANCELLED,
    STATUS_CLOSED,
    Incident,
    StatusHistory,
    incident_consequences,
)

_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
CACHE_TTL = timedelta(minutes=5)


def _cache_key(f: dict) -> str:
    return "_".join(
        f"{k}:{v.isoformat() if hasattr(v, 'isoformat') else v}"
        for k, v in sorted(f.items())
    )


def _apply_filters(f: dict, *, use_status_history_changed_at: bool = False) -> list:
    """Строит список SQLAlchemy-условий из словаря фильтров.

    Отменённые инциденты (status = cancelled) ВСЕГДА исключаются из аналитики —
    смысл этого состояния в том, что событие признано не-инцидентом и не должно
    влиять на статистику.

    use_status_history_changed_at=True — заменяет фильтр по registered_at на StatusHistory.changed_at
    (используется в подсчёте 'закрыто за период' в trend).
    """
    conditions = [Incident.status != STATUS_CANCELLED]
    if not use_status_history_changed_at:
        if f.get("period_from"):
            conditions.append(Incident.registered_at >= f["period_from"])
        if f.get("period_to"):
            conditions.append(Incident.registered_at <= f["period_to"])
    if f.get("department_id"):
        conditions.append(Incident.department_id == f["department_id"])
    if f.get("category_id"):
        conditions.append(Incident.category_id == f["category_id"])
    if f.get("severity_id"):
        conditions.append(Incident.severity_id == f["severity_id"])
    if f.get("source_id"):
        conditions.append(Incident.source_id == f["source_id"])
    if f.get("funnel_stage_id"):
        conditions.append(Incident.funnel_stage_id == f["funnel_stage_id"])
    if f.get("consequence_id"):
        conditions.append(
            Incident.id.in_(
                select(incident_consequences.c.incident_id).where(
                    incident_consequences.c.consequence_id == f["consequence_id"]
                )
            )
        )
    return conditions


def _kpis(db: Session, f: dict) -> dict[str, Any]:
    base = _apply_filters(f)
    total = db.scalar(select(func.count(Incident.id)).where(and_(*base))) or 0

    closed_count = (
        db.scalar(
            select(func.count(Incident.id)).where(
                and_(*base, Incident.status == STATUS_CLOSED)
            )
        )
        or 0
    )
    closure_coefficient = round(100.0 * closed_count / total, 1) if total else 0.0

    critical_count = (
        db.scalar(
            select(func.count(Incident.id))
            .join(Severity, Incident.severity_id == Severity.id)
            .where(and_(*base, Severity.code == "critical"))
        )
        or 0
    )
    critical_share = round(100.0 * critical_count / total, 1) if total else 0.0

    mttr_seconds = (
        db.scalar(
            select(func.avg(func.extract("epoch", StatusHistory.changed_at - Incident.registered_at)))
            .select_from(Incident)
            .join(StatusHistory, StatusHistory.incident_id == Incident.id)
            .where(and_(*base, StatusHistory.new_status == STATUS_CLOSED))
        )
        or 0
    )
    mttr_hours = round(float(mttr_seconds) / 3600, 1) if mttr_seconds else 0.0

    recurring_subq = (
        select(Incident.category_id, func.count(Incident.id).label("c"))
        .where(and_(*base))
        .group_by(Incident.category_id)
        .having(func.count(Incident.id) >= 2)
        .subquery()
    )
    recurring_count = int(
        db.scalar(select(func.coalesce(func.sum(recurring_subq.c.c), 0))) or 0
    )
    recurrence_freq = round(100.0 * recurring_count / total, 1) if total else 0.0

    return {
        "total_incidents": total,
        "mttr_hours": mttr_hours,
        "closure_coefficient": closure_coefficient,
        "recurrence_frequency": recurrence_freq,
        "critical_share": critical_share,
    }


def _funnel(db: Session, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(FunnelStage.id, FunnelStage.name, FunnelStage.order_number, func.count(Incident.id))
        .select_from(FunnelStage)
        .join(Incident, Incident.funnel_stage_id == FunnelStage.id, isouter=True)
        .where(and_(*base))
        .group_by(FunnelStage.id, FunnelStage.name, FunnelStage.order_number)
        .order_by(FunnelStage.order_number)
    ).all()
    return [{"id": r[0], "name": r[1], "count": r[3] or 0} for r in rows]


def _generic_distribution(db: Session, model, fk_col, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(model.id, model.name, func.count(Incident.id))
        .select_from(model)
        .join(Incident, fk_col == model.id, isouter=True)
        .where(and_(*base))
        .group_by(model.id, model.name)
    ).all()
    return [{"id": r[0], "name": r[1], "count": r[2] or 0} for r in rows]


def _consequence_distribution(db: Session, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(Consequence.id, Consequence.name, func.count(Incident.id))
        .select_from(Consequence)
        .join(
            incident_consequences,
            Consequence.id == incident_consequences.c.consequence_id,
        )
        .join(Incident, incident_consequences.c.incident_id == Incident.id)
        .where(and_(*base))
        .group_by(Consequence.id, Consequence.name)
        .order_by(func.count(Incident.id).desc())
    ).all()
    return [{"id": r[0], "name": r[1], "count": r[2]} for r in rows]


def _category_by_department(db: Session, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(
            Category.id,
            Category.name,
            Department.id,
            Department.name,
            func.count(Incident.id),
        )
        .select_from(Incident)
        .join(Category, Incident.category_id == Category.id)
        .join(Department, Incident.department_id == Department.id)
        .where(and_(*base))
        .group_by(Category.id, Category.name, Department.id, Department.name)
    ).all()
    return [
        {
            "category_id": r[0],
            "category": r[1],
            "department_id": r[2],
            "department": r[3],
            "count": r[4],
        }
        for r in rows
    ]


def _status_distribution(db: Session, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(Incident.status, func.count(Incident.id))
        .where(and_(*base))
        .group_by(Incident.status)
    ).all()
    return [{"status": r[0], "count": r[1]} for r in rows]


def _top_departments(db: Session, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(Department.id, Department.name, func.count(Incident.id).label("c"))
        .select_from(Department)
        .join(Incident, Incident.department_id == Department.id)
        .where(and_(*base))
        .group_by(Department.id, Department.name)
        .order_by(func.count(Incident.id).desc())
        .limit(5)
    ).all()
    return [{"id": r[0], "name": r[1], "count": r[2]} for r in rows]


def _trend(db: Session, f: dict):
    """По каждому дню: зарегистрировано, закрыто, из них критичных."""
    reg_base = _apply_filters(f)
    reg_day = func.date_trunc("day", Incident.registered_at).label("day")
    reg_rows = db.execute(
        select(
            reg_day,
            func.count(Incident.id).label("registered"),
            func.coalesce(
                func.sum(case((Severity.code == "critical", 1), else_=0)),
                0,
            ).label("critical"),
        )
        .select_from(Incident)
        .join(Severity, Incident.severity_id == Severity.id, isouter=True)
        .where(and_(*reg_base))
        .group_by(reg_day)
    ).all()

    close_base = _apply_filters(f, use_status_history_changed_at=True)
    close_base += [
        StatusHistory.new_status == STATUS_CLOSED,
        StatusHistory.changed_at >= f["period_from"],
        StatusHistory.changed_at <= f["period_to"],
    ]
    close_day = func.date_trunc("day", StatusHistory.changed_at).label("day")
    close_rows = db.execute(
        select(close_day, func.count(StatusHistory.id))
        .select_from(StatusHistory)
        .join(Incident, StatusHistory.incident_id == Incident.id)
        .where(and_(*close_base))
        .group_by(close_day)
    ).all()

    by_date: dict = {}
    for r in reg_rows:
        key = r[0].isoformat() if r[0] else None
        by_date[key] = {
            "date": key,
            "registered": int(r[1] or 0),
            "critical": int(r[2] or 0),
            "closed": 0,
        }
    for r in close_rows:
        key = r[0].isoformat() if r[0] else None
        if key in by_date:
            by_date[key]["closed"] = int(r[1] or 0)
        else:
            by_date[key] = {
                "date": key,
                "registered": 0,
                "critical": 0,
                "closed": int(r[1] or 0),
            }

    return sorted(by_date.values(), key=lambda x: x.get("date") or "")


def _severity_by_stage_heatmap(db: Session, f: dict):
    base = _apply_filters(f)
    rows = db.execute(
        select(
            FunnelStage.name,
            Severity.name,
            Severity.code,
            func.count(Incident.id),
        )
        .select_from(Incident)
        .join(FunnelStage, Incident.funnel_stage_id == FunnelStage.id)
        .join(Severity, Incident.severity_id == Severity.id)
        .where(and_(*base))
        .group_by(FunnelStage.name, Severity.name, Severity.code, FunnelStage.order_number)
        .order_by(FunnelStage.order_number)
    ).all()
    return [{"stage": r[0], "severity": r[1], "severity_code": r[2], "count": r[3]} for r in rows]


def _activity_heatmap(db: Session, f: dict):
    base = _apply_filters(f)
    dow = func.extract("dow", Incident.registered_at).label("dow")
    hour = func.extract("hour", Incident.registered_at).label("hour")
    rows = db.execute(
        select(dow, hour, func.count(Incident.id))
        .where(and_(*base))
        .group_by(dow, hour)
    ).all()
    return [{"day": int(r[0]), "hour": int(r[1]), "count": r[2]} for r in rows]


def build_dashboard(
    db: Session,
    period_from: datetime,
    period_to: datetime,
    department_id: int | None = None,
    category_id: int | None = None,
    severity_id: int | None = None,
    source_id: int | None = None,
    funnel_stage_id: int | None = None,
    consequence_id: int | None = None,
) -> dict[str, Any]:
    f = {
        "period_from": period_from,
        "period_to": period_to,
        "department_id": department_id,
        "category_id": category_id,
        "severity_id": severity_id,
        "source_id": source_id,
        "funnel_stage_id": funnel_stage_id,
        "consequence_id": consequence_id,
    }

    key = _cache_key(f)
    cached = _cache.get(key)
    now = datetime.now(timezone.utc)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    duration = period_to - period_from
    prev_f = {**f, "period_from": period_from - duration, "period_to": period_from}

    data = {
        "kpis": {"current": _kpis(db, f), "previous": _kpis(db, prev_f)},
        "funnel": _funnel(db, f),
        "trend": _trend(db, f),
        "top_departments": _top_departments(db, f),
        "distributions": {
            "categories": _generic_distribution(db, Category, Incident.category_id, f),
            "sources": _generic_distribution(db, Source, Incident.source_id, f),
            "severities": _generic_distribution(db, Severity, Incident.severity_id, f),
            "statuses": _status_distribution(db, f),
            "consequences": _consequence_distribution(db, f),
        },
        "category_by_department": _category_by_department(db, f),
        "severity_by_stage_heatmap": _severity_by_stage_heatmap(db, f),
        "activity_heatmap": _activity_heatmap(db, f),
    }
    _cache[key] = (now, data)
    return data
