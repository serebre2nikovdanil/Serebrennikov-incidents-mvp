from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.modules.incidents import service
from app.modules.incidents.models import Attachment
from app.modules.incidents.schemas import (
    CommentCreate,
    CommentRead,
    IncidentCreate,
    IncidentListItem,
    IncidentRead,
    IncidentUpdate,
    RecentValues,
    TransitionRequest,
)
from app.modules.users.models import User

router = APIRouter(prefix="/incidents", tags=["incidents"])
attachments_router = APIRouter(prefix="/attachments", tags=["incidents"])

STORAGE_DIR = Path("/code/storage/attachments")
ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-excel",
}
MAX_FILE_SIZE = 3 * 1024 * 1024


@router.get("/recent-values", response_model=RecentValues)
def recent_values(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.recent_values(db, user.id)


@router.get("", response_model=dict)
def list_incidents(
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
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Менеджер видит только свои инциденты — игнорируем переданный initiator_id
    if user.role == "manager":
        initiator_id = user.id
    items, total = service.list_incidents(
        db,
        department_id=department_id,
        category_id=category_id,
        source_id=source_id,
        severity_id=severity_id,
        funnel_stage_id=funnel_stage_id,
        status=status,
        initiator_id=initiator_id,
        period_from=period_from,
        period_to=period_to,
        keyword=keyword,
        offset=offset,
        limit=limit,
    )
    def _ref(o):
        return {"id": o.id, "name": o.name} if o else None

    serialized = [
        {
            "id": i.id,
            "description": i.description,
            "status": i.status,
            "registered_at": i.registered_at,
            "occured_at": i.occured_at,
            "is_anonymous": i.is_anonymous,
            "initiator": None
            if i.is_anonymous and i.initiator_id != user.id and user.role == "manager"
            else {"id": i.initiator.id, "full_name": i.initiator.full_name},
            "department": _ref(i.department),
            "category": _ref(i.category),
            "severity": _ref(i.severity),
            "source": _ref(i.source),
            "funnel_stage": _ref(i.funnel_stage),
        }
        for i in items
    ]
    return {"items": serialized, "total": total, "offset": offset, "limit": limit}


@router.post("", status_code=201)
def create_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("manager", "administrator")),
):
    incident = service.create_incident(db, payload.model_dump(), initiator_id=user.id)
    db.commit()
    db.refresh(incident)
    return service.serialize_for_response(
        incident, hide_initiator_if_anonymous=False, viewer_id=user.id
    )


@router.get("/{incident_id}")
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    incident = service.get_incident(db, incident_id)
    if user.role == "manager" and incident.initiator_id != user.id:
        raise HTTPException(status_code=403, detail="Доступ только к своим инцидентам")
    return service.serialize_for_response(
        incident,
        hide_initiator_if_anonymous=(user.role == "manager"),
        viewer_id=user.id,
    )


@router.patch("/{incident_id}")
def update_incident(
    incident_id: int,
    payload: IncidentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    incident = service.update_incident(
        db,
        incident_id,
        payload.model_dump(exclude_unset=True),
        initiator_id=user.id,
        role=user.role,
    )
    db.commit()
    db.refresh(incident)
    return service.serialize_for_response(
        incident, hide_initiator_if_anonymous=False, viewer_id=user.id
    )


@router.post("/{incident_id}/transitions")
def transition(
    incident_id: int,
    payload: TransitionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("manager", "supervisor", "administrator")),
):
    # Менеджер может двигать только свои инциденты
    if user.role == "manager":
        incident_check = service.get_incident(db, incident_id)
        if incident_check.initiator_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="Менеджер может менять статус только своих инцидентов",
            )
    incident = service.transition_incident(
        db, incident_id, payload.target_status, payload.reason, initiator_id=user.id
    )
    db.commit()
    db.refresh(incident)
    return service.serialize_for_response(
        incident, hide_initiator_if_anonymous=False, viewer_id=user.id
    )


@router.get("/{incident_id}/comments", response_model=list[CommentRead])
def list_comments(
    incident_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    incident = service.get_incident(db, incident_id)
    return incident.comments


@router.post("/{incident_id}/comments", response_model=CommentRead, status_code=201)
def add_comment(
    incident_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("manager", "supervisor", "administrator")),
):
    comment = service.add_comment(db, incident_id, payload.text, author_id=user.id)
    db.commit()
    db.refresh(comment)
    return comment


@router.post("/{incident_id}/attachments", status_code=201)
async def upload_attachment(
    incident_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("manager", "supervisor", "administrator")),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Тип файла не поддерживается: {file.content_type}",
        )
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Размер файла превышает 3 МБ")

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid4().hex}_{file.filename}"
    file_path = STORAGE_DIR / safe_name
    file_path.write_bytes(contents)

    att = service.add_attachment_record(
        db,
        incident_id=incident_id,
        file_name=file.filename or safe_name,
        file_path=str(file_path),
        file_size=len(contents),
        mime_type=file.content_type,
        uploader_id=user.id,
    )
    db.commit()
    db.refresh(att)
    return {
        "id": att.id,
        "file_name": att.file_name,
        "file_size": att.file_size,
        "mime_type": att.mime_type,
        "uploader": {"id": att.uploader.id, "full_name": att.uploader.full_name},
        "uploaded_at": att.uploaded_at,
    }


@attachments_router.get("/{attachment_id}")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    att = db.get(Attachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Вложение не найдено")
    return FileResponse(att.file_path, media_type=att.mime_type, filename=att.file_name)
