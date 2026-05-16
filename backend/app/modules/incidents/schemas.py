from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Ref(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


class IncidentCreate(BaseModel):
    description: str = Field(min_length=1, max_length=2000)
    occured_at: datetime
    department_id: int
    funnel_stage_id: int
    category_id: int | None = None
    severity_id: int | None = None
    source_id: int | None = None
    consequence_ids: list[int] = []
    is_anonymous: bool = False


class IncidentUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    occured_at: datetime | None = None
    category_id: int | None = None
    severity_id: int | None = None
    source_id: int | None = None
    funnel_stage_id: int | None = None
    consequence_ids: list[int] | None = None


class StatusHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    previous_status: str | None
    new_status: str
    transition_reason: str | None
    initiator: UserRef
    changed_at: datetime


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str
    author: UserRef
    created_at: datetime


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    file_name: str
    file_size: int
    mime_type: str
    uploader: UserRef
    uploaded_at: datetime


class IncidentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    description: str
    status: str
    registered_at: datetime
    occured_at: datetime
    is_anonymous: bool
    initiator: UserRef | None  # скрываем если is_anonymous
    department: Ref
    category: Ref | None = None
    severity: Ref | None = None
    source: Ref | None = None
    funnel_stage: Ref


class IncidentRead(IncidentListItem):
    cancellation_reason: str | None = None
    reopening_reason: str | None = None
    consequences: list[Ref] = []
    status_history: list[StatusHistoryRead] = []
    comments: list[CommentRead] = []
    attachments: list[AttachmentRead] = []


class TransitionRequest(BaseModel):
    target_status: str
    reason: str | None = None


class RecentValues(BaseModel):
    category_ids: list[int]
    source_ids: list[int]
    funnel_stage_ids: list[int]


class IncidentList(BaseModel):
    items: list[IncidentListItem]
    total: int
    offset: int
    limit: int
