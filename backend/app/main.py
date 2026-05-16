import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine

# Импорт моделей всех модулей — нужен, чтобы create_all их зарегистрировал
from app.modules.audit import models as _audit_models  # noqa: F401
from app.modules.audit.router import router as audit_router
from app.modules.analytics.router import router as analytics_router
from app.modules.catalogs import models as _catalog_models  # noqa: F401
from app.modules.catalogs.router import router as catalogs_router, templates_router
from app.modules.incidents import models as _incident_models  # noqa: F401
from app.modules.incidents.router import attachments_router, router as incidents_router
from app.modules.users import models as _user_models  # noqa: F401
from app.modules.users.router import auth_router, users_router
from app.shared.seeds import apply_schema_patches, install_audit_trigger, seed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        apply_schema_patches(db)
        install_audit_trigger(db)
        seed(db)
        logger.info("Database initialized: tables created, triggers installed, seeds applied")
    finally:
        db.close()
    yield


app = FastAPI(
    title="ИС учёта операционных инцидентов",
    description="Backend API информационной системы регистрации инцидентов в отделах продаж",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(catalogs_router)
app.include_router(templates_router)
app.include_router(incidents_router)
app.include_router(attachments_router)
app.include_router(audit_router)
app.include_router(analytics_router)

# В проде (Railway) Dockerfile кладёт собранный фронт в /code/static —
# тогда FastAPI отдаёт его с того же домена. Локально (docker compose)
# папки нет, маршрут не регистрируется, фронт обслуживает Vite на :5173.
_static_dir = "static"
if os.path.isdir(_static_dir):
    _index_path = os.path.join(_static_dir, "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Если запрошен реальный файл из static/ (assets, favicon и т.п.) — отдаём его.
        # Иначе возвращаем index.html, чтобы клиентский React Router сам разобрал маршрут.
        candidate = os.path.join(_static_dir, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_index_path)
