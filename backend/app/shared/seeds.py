"""Заполнение справочников и создание администратора при первом запуске."""

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.catalogs.models import (
    Category,
    Consequence,
    Department,
    FunnelStage,
    IncidentTemplate,
    Severity,
    Source,
)
from app.modules.users.models import User

logger = logging.getLogger(__name__)


SEVERITIES = [
    {"code": "critical", "name": "Критичный", "order_number": 1},
    {"code": "significant", "name": "Значительный", "order_number": 2},
    {"code": "minor", "name": "Незначительный", "order_number": 3},
]

SOURCES = [
    {"code": "human", "name": "Человеческий фактор"},
    {"code": "process", "name": "Процесс"},
    {"code": "technological", "name": "Технологический"},
    {"code": "external", "name": "Внешний"},
]

CONSEQUENCES = [
    {"code": "financial", "name": "Финансовое"},
    {"code": "operational", "name": "Операционное"},
    {"code": "reputational", "name": "Репутационное"},
    {"code": "regulatory", "name": "Регуляторное"},
]

FUNNEL_STAGES = [
    {"name": "Генерация лидов", "order_number": 1},
    {"name": "Первичный контакт", "order_number": 2},
    {"name": "Подготовка КП", "order_number": 3},
    {"name": "Переговоры", "order_number": 4},
    {"name": "Закрытие сделки", "order_number": 5},
    {"name": "Исполнение контракта", "order_number": 6},
    {"name": "Постпродажное обслуживание", "order_number": 7},
]

CATEGORIES = [
    {"name": "Ошибка в коммерческом предложении"},
    {"name": "Просроченный ответ клиенту"},
    {"name": "Ошибка в документации"},
    {"name": "Несогласованность с поставкой"},
    {"name": "Технический сбой"},
    {"name": "Прочее"},
]

DEPARTMENTS = [
    {"name": "Отдел продаж — Москва"},
    {"name": "Отдел продаж — Санкт-Петербург"},
    {"name": "Отдел продаж — регионы"},
]

TEMPLATES = [
    {
        "name": "Ошибка в КП",
        "description_template": "Обнаружена ошибка в расчёте стоимости в коммерческом предложении…",
        "category_name": "Ошибка в коммерческом предложении",
        "severity_code": "significant",
        "source_code": "human",
        "funnel_stage_name": "Подготовка КП",
    },
    {
        "name": "Просроченный ответ клиенту",
        "description_template": "Менеджер не ответил клиенту в установленный срок…",
        "category_name": "Просроченный ответ клиенту",
        "severity_code": "significant",
        "source_code": "human",
        "funnel_stage_name": "Первичный контакт",
    },
    {
        "name": "Документация с ошибкой",
        "description_template": "В договоре/документах обнаружена ошибка…",
        "category_name": "Ошибка в документации",
        "severity_code": "significant",
        "source_code": "process",
        "funnel_stage_name": "Закрытие сделки",
    },
    {
        "name": "Несогласованность с поставкой",
        "description_template": "Условия сделки не согласованы с отделом логистики/склада…",
        "category_name": "Несогласованность с поставкой",
        "severity_code": "critical",
        "source_code": "process",
        "funnel_stage_name": "Исполнение контракта",
    },
]


def _ensure(db: Session, model, lookup: dict, defaults: dict):
    existing = db.query(model).filter_by(**lookup).first()
    if existing:
        return existing
    obj = model(**lookup, **defaults)
    db.add(obj)
    db.flush()
    return obj


def seed(db: Session) -> None:
    for s in SEVERITIES:
        _ensure(db, Severity, {"code": s["code"]}, {"name": s["name"], "order_number": s["order_number"]})
    for s in SOURCES:
        _ensure(db, Source, {"code": s["code"]}, {"name": s["name"]})
    for c in CONSEQUENCES:
        _ensure(db, Consequence, {"code": c["code"]}, {"name": c["name"]})
    for f in FUNNEL_STAGES:
        _ensure(db, FunnelStage, {"name": f["name"]}, {"order_number": f["order_number"]})
    for c in CATEGORIES:
        _ensure(db, Category, {"name": c["name"]}, {})
    for d in DEPARTMENTS:
        _ensure(db, Department, {"name": d["name"]}, {})

    # Шаблоны инцидентов
    for tpl in TEMPLATES:
        if db.query(IncidentTemplate).filter_by(name=tpl["name"]).first():
            continue
        category = db.query(Category).filter_by(name=tpl["category_name"]).first()
        severity = db.query(Severity).filter_by(code=tpl["severity_code"]).first()
        source = db.query(Source).filter_by(code=tpl["source_code"]).first()
        stage = db.query(FunnelStage).filter_by(name=tpl["funnel_stage_name"]).first()
        db.add(
            IncidentTemplate(
                name=tpl["name"],
                description_template=tpl["description_template"],
                category_id=category.id if category else None,
                severity_id=severity.id if severity else None,
                source_id=source.id if source else None,
                funnel_stage_id=stage.id if stage else None,
            )
        )

    # Администратор по умолчанию
    admin = db.query(User).filter_by(email=settings.DEFAULT_ADMIN_EMAIL).first()
    if not admin:
        default_dept = db.query(Department).first()
        db.add(
            User(
                full_name=settings.DEFAULT_ADMIN_NAME,
                email=settings.DEFAULT_ADMIN_EMAIL,
                password_hash=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                role="administrator",
                department_id=default_dept.id if default_dept else None,
            )
        )
        logger.info("Default administrator created: %s", settings.DEFAULT_ADMIN_EMAIL)

    db.commit()


SCHEMA_PATCHES = [
    # Делаем категорию/Тяжесть/источник опциональными в инцидентах
    "ALTER TABLE incidents ALTER COLUMN category_id DROP NOT NULL",
    "ALTER TABLE incidents ALTER COLUMN severity_id DROP NOT NULL",
    "ALTER TABLE incidents ALTER COLUMN source_id DROP NOT NULL",
    # Личные шаблоны менеджеров
    "ALTER TABLE incident_templates ADD COLUMN IF NOT EXISTS owner_id INTEGER",
    "ALTER TABLE incident_templates DROP CONSTRAINT IF EXISTS incident_templates_name_key",
    """
    DO $do$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'incident_templates_owner_id_fkey'
        ) THEN
            ALTER TABLE incident_templates
            ADD CONSTRAINT incident_templates_owner_id_fkey
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END
    $do$
    """,
]


def apply_schema_patches(db: Session) -> None:
    from sqlalchemy import text
    for stmt in SCHEMA_PATCHES:
        db.execute(text(stmt))
    db.commit()


AUDIT_TRIGGER_STATEMENTS = [
    """
    CREATE OR REPLACE FUNCTION prevent_audit_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_entries are immutable: % is not allowed', TG_OP;
    END;
    $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS audit_entries_no_update ON audit_entries",
    """
    CREATE TRIGGER audit_entries_no_update
    BEFORE UPDATE ON audit_entries
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification()
    """,
    "DROP TRIGGER IF EXISTS audit_entries_no_delete ON audit_entries",
    """
    CREATE TRIGGER audit_entries_no_delete
    BEFORE DELETE ON audit_entries
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification()
    """,
]


def install_audit_trigger(db: Session) -> None:
    from sqlalchemy import text

    for stmt in AUDIT_TRIGGER_STATEMENTS:
        db.execute(text(stmt))
    db.commit()
