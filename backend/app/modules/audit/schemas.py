from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InitiatorRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


class AuditEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action_type: str
    object_type: str
    object_id: str | None
    previous_value: str | None
    new_value: str | None
    initiator: InitiatorRef | None
    created_at: datetime


class AuditList(BaseModel):
    items: list[AuditEntryRead]
    total: int
    offset: int
    limit: int
