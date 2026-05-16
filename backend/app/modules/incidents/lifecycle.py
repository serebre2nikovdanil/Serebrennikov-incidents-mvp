"""Машина состояний инцидента.

Допустимые переходы:
- registered → under_review
- under_review → processed
- processed → closed
- closed → under_review (переоткрытие, требует причину)
- любой → cancelled (требует причину)
"""

from fastapi import HTTPException

from app.modules.incidents.models import (
    STATUS_CANCELLED,
    STATUS_CLOSED,
    STATUS_PROCESSED,
    STATUS_REGISTERED,
    STATUS_UNDER_REVIEW,
)

ALLOWED: dict[str, set[str]] = {
    STATUS_REGISTERED: {STATUS_UNDER_REVIEW, STATUS_CANCELLED},
    STATUS_UNDER_REVIEW: {STATUS_PROCESSED, STATUS_CANCELLED},
    STATUS_PROCESSED: {STATUS_CLOSED, STATUS_CANCELLED, STATUS_UNDER_REVIEW},  # + возврат на доработку
    STATUS_CLOSED: {STATUS_UNDER_REVIEW},  # переоткрытие
    STATUS_CANCELLED: set(),  # терминальный
}

REASON_REQUIRED: dict[tuple[str, str], str] = {
    (STATUS_REGISTERED, STATUS_CANCELLED): "cancellation_reason",
    (STATUS_UNDER_REVIEW, STATUS_CANCELLED): "cancellation_reason",
    (STATUS_PROCESSED, STATUS_CANCELLED): "cancellation_reason",
    (STATUS_PROCESSED, STATUS_UNDER_REVIEW): "reopening_reason",  # возврат на доработку
    (STATUS_CLOSED, STATUS_UNDER_REVIEW): "reopening_reason",
}


def validate_transition(current: str, target: str, reason: str | None) -> str | None:
    """Проверяет допустимость перехода. Возвращает имя поля, в которое нужно записать причину."""
    if target not in ALLOWED.get(current, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый переход: {current} → {target}",
        )
    reason_field = REASON_REQUIRED.get((current, target))
    if reason_field and (not reason or not reason.strip()):
        raise HTTPException(
            status_code=400,
            detail="Для этого перехода требуется указать причину",
        )
    return reason_field
