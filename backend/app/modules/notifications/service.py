"""Заглушка модуля уведомлений.

Реальная отправка email через SMTP не реализована (F-18/F-19 — Could Have).
Здесь — интерфейс, который другие модули могут вызывать, не зная о реализации.
"""

import logging

logger = logging.getLogger(__name__)


def notify_new_incident(*, incident_id: int, department_id: int) -> None:
    logger.info("notify_new_incident: incident_id=%s, department_id=%s", incident_id, department_id)


def notify_status_change(*, incident_id: int, initiator_id: int, new_status: str) -> None:
    logger.info(
        "notify_status_change: incident_id=%s, initiator_id=%s, new_status=%s",
        incident_id,
        initiator_id,
        new_status,
    )
