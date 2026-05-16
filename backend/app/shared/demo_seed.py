"""Генератор демо-данных для заполнения дашборда.

Запуск:
    docker exec incident-backend python -m app.shared.demo_seed
"""

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
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
    STATUS_PROCESSED,
    STATUS_REGISTERED,
    STATUS_UNDER_REVIEW,
    Comment,
    Incident,
    StatusHistory,
)
from app.modules.users.models import User

DESCRIPTIONS = {
    "Ошибка в коммерческом предложении": [
        "Неверно посчитана скидка — клиент отказался от сделки.",
        "В КП указан устаревший прайс, клиент попросил пересмотр.",
        "Опечатка в спецификации — недопонимание по составу поставки.",
        "Не учтены условия логистики — итоговая цена выросла на 12%.",
    ],
    "Просроченный ответ клиенту": [
        "Менеджер не вернулся к клиенту в течение 3 рабочих дней.",
        "Запрос клиента ушёл в почту, ответ задержан на 5 дней.",
        "Клиент написал в чат, никто не отреагировал — ушёл к конкуренту.",
        "Ответ на тендер ушёл после дедлайна.",
    ],
    "Ошибка в документации": [
        "В договоре указаны неверные реквизиты, переподписали.",
        "В акте ошибка в датах оказания услуг.",
        "В счёт-фактуру попал ИНН другого клиента.",
        "Не приложили спецификацию к договору.",
    ],
    "Несогласованность с поставкой": [
        "Менеджер обещал срок 5 дней, склад подтвердил 10.",
        "Не уточнили остатки — продали то, чего нет.",
        "Логистика не приняла маршрут согласованный с клиентом.",
        "Курьер сорвал доставку, клиента не предупредили.",
    ],
    "Технический сбой": [
        "CRM упала во время демонстрации клиенту.",
        "Письма из ящика менеджера не отправлялись 2 часа.",
        "База данных недоступна 30 минут — потеряли заявку.",
        "Сайт отдавал 500-ю ошибку, клиент не смог отправить заявку.",
    ],
    "Прочее": [
        "Клиент пожаловался на тон общения менеджера.",
        "Конкуренты сделали лучше предложение, не успели среагировать.",
        "Технические условия проекта изменились по ходу обсуждения.",
    ],
}

COMMENTS_POOL = [
    "Связались с клиентом, готовим исправленное предложение.",
    "Передал в отдел качества для разбора.",
    "Договорились о компенсации скидкой 5%.",
    "Ситуация под контролем, согласовываем сроки.",
    "Дополнительно созвонились с руководителем клиента.",
    "Клиент согласился на повторное обсуждение условий.",
]


def generate(num_incidents: int = 200) -> None:
    db = SessionLocal()
    try:
        # Демо-менеджеры
        demo_users: list[User] = []
        for name, email in [
            ("Иван Иванов", "ivanov@example.com"),
            ("Пётр Петров", "petrov@example.com"),
            ("Сидор Сидоров", "sidorov@example.com"),
            ("Анна Кузнецова", "kuznetsova@example.com"),
            ("Мария Лебедева", "lebedeva@example.com"),
        ]:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(
                    full_name=name,
                    email=email,
                    password_hash=hash_password("demo12345"),
                    role="manager",
                )
                db.add(user)
                db.flush()
            demo_users.append(user)

        # Демо-руководитель
        supervisor = db.scalar(select(User).where(User.email == "supervisor@example.com"))
        if not supervisor:
            supervisor = User(
                full_name="Алексей Руководитель",
                email="supervisor@example.com",
                password_hash=hash_password("super12345"),
                role="supervisor",
            )
            db.add(supervisor)
            db.flush()

        departments = list(db.scalars(select(Department).where(Department.is_active.is_(True))))
        categories = list(db.scalars(select(Category).where(Category.is_active.is_(True))))
        severities = list(db.scalars(select(Severity).where(Severity.is_active.is_(True))))
        sources = list(db.scalars(select(Source).where(Source.is_active.is_(True))))
        funnel_stages = list(
            db.scalars(select(FunnelStage).where(FunnelStage.is_active.is_(True)))
        )
        consequences = list(
            db.scalars(select(Consequence).where(Consequence.is_active.is_(True)))
        )

        if not (
            departments
            and categories
            and severities
            and sources
            and funnel_stages
            and consequences
        ):
            print("ERROR: справочники пусты, нечем заполнять инциденты")
            return

        severity_weights = {"critical": 0.18, "significant": 0.42, "minor": 0.40}
        source_weights = {
            "human": 0.40,
            "process": 0.30,
            "technological": 0.20,
            "external": 0.10,
        }
        severity_by_code = {s.code: s for s in severities}
        source_by_code = {s.code: s for s in sources}

        # Категории чаще повторяющиеся — для метрики Recurrence Frequency
        category_weights = []
        for c in categories:
            if c.name in ("Ошибка в коммерческом предложении", "Просроченный ответ клиенту"):
                category_weights.append(0.30)
            elif c.name == "Ошибка в документации":
                category_weights.append(0.20)
            else:
                category_weights.append(0.05)

        now = datetime.now(timezone.utc)
        random.seed(42)

        created = 0
        for _ in range(num_incidents):
            # Распределение по возрасту — треугольное, перекос к свежим
            days_ago = int(random.triangular(0, 90, 10))
            # Часы — бизнес-часы с пиком к 17-18ч (пятничный аврал)
            hour_weights = [1] * 8 + [3, 5, 8, 10, 12, 15, 18, 20, 18, 15, 12, 8, 5, 3, 2, 1]
            hour = random.choices(list(range(24)), weights=hour_weights)[0]
            occurred_at = now - timedelta(
                days=days_ago,
                hours=24 - hour,
                minutes=random.randint(0, 59),
            )
            registered_at = occurred_at + timedelta(minutes=random.randint(5, 240))
            if registered_at > now:
                registered_at = now

            sev_code = random.choices(
                list(severity_weights.keys()), weights=list(severity_weights.values())
            )[0]
            src_code = random.choices(
                list(source_weights.keys()), weights=list(source_weights.values())
            )[0]
            category = random.choices(categories, weights=category_weights)[0]
            department = random.choice(departments)
            stage = random.choice(funnel_stages)
            initiator = random.choice(demo_users)
            description = random.choice(
                DESCRIPTIONS.get(category.name, DESCRIPTIONS["Прочее"])
            )

            # Статус зависит от возраста
            if days_ago < 3:
                status_choice = random.choices(
                    [STATUS_REGISTERED, STATUS_UNDER_REVIEW], weights=[0.6, 0.4]
                )[0]
            elif days_ago < 14:
                status_choice = random.choices(
                    [
                        STATUS_REGISTERED,
                        STATUS_UNDER_REVIEW,
                        STATUS_PROCESSED,
                        STATUS_CLOSED,
                        STATUS_CANCELLED,
                    ],
                    weights=[0.1, 0.3, 0.2, 0.3, 0.1],
                )[0]
            else:
                status_choice = random.choices(
                    [
                        STATUS_CLOSED,
                        STATUS_CANCELLED,
                        STATUS_UNDER_REVIEW,
                        STATUS_PROCESSED,
                    ],
                    weights=[0.55, 0.15, 0.15, 0.15],
                )[0]

            incident = Incident(
                description=description,
                occured_at=occurred_at,
                registered_at=registered_at,
                department_id=department.id,
                category_id=category.id,
                severity_id=severity_by_code[sev_code].id,
                source_id=source_by_code[src_code].id,
                funnel_stage_id=stage.id,
                initiator_id=initiator.id,
                status=status_choice,
                is_anonymous=random.random() < 0.05,
            )
            if random.random() < 0.7 and consequences:
                k = min(len(consequences), random.randint(1, 2))
                incident.consequences = random.sample(consequences, k=k)
            if status_choice == STATUS_CANCELLED:
                incident.cancellation_reason = "Не подтверждена приоритетность"
            db.add(incident)
            db.flush()

            # История переходов
            history_at = registered_at
            db.add(
                StatusHistory(
                    incident_id=incident.id,
                    previous_status=None,
                    new_status=STATUS_REGISTERED,
                    initiator_id=initiator.id,
                    changed_at=history_at,
                )
            )

            path: list[str] = []
            if status_choice == STATUS_UNDER_REVIEW:
                path = [STATUS_UNDER_REVIEW]
            elif status_choice == STATUS_PROCESSED:
                path = [STATUS_UNDER_REVIEW, STATUS_PROCESSED]
            elif status_choice == STATUS_CLOSED:
                path = [STATUS_UNDER_REVIEW, STATUS_PROCESSED, STATUS_CLOSED]
            elif status_choice == STATUS_CANCELLED:
                if random.random() < 0.5:
                    path = [STATUS_CANCELLED]
                else:
                    path = [STATUS_UNDER_REVIEW, STATUS_CANCELLED]

            prev = STATUS_REGISTERED
            for tgt in path:
                history_at = history_at + timedelta(hours=random.uniform(1, 48))
                if history_at > now:
                    history_at = now
                reason = (
                    "Не подтверждена приоритетность" if tgt == STATUS_CANCELLED else None
                )
                db.add(
                    StatusHistory(
                        incident_id=incident.id,
                        previous_status=prev,
                        new_status=tgt,
                        initiator_id=supervisor.id,
                        transition_reason=reason,
                        changed_at=history_at,
                    )
                )
                prev = tgt

            # Комментарии для части инцидентов
            if random.random() < 0.35:
                for _ in range(random.randint(1, 2)):
                    db.add(
                        Comment(
                            incident_id=incident.id,
                            text=random.choice(COMMENTS_POOL),
                            author_id=random.choice([initiator.id, supervisor.id]),
                            created_at=registered_at
                            + timedelta(hours=random.uniform(1, 72)),
                        )
                    )

            created += 1

        db.commit()
        print(f"Generated {created} demo incidents")
    finally:
        db.close()


if __name__ == "__main__":
    generate()
