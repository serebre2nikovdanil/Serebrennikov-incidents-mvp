from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Column,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


STATUS_REGISTERED = "registered"
STATUS_UNDER_REVIEW = "under_review"
STATUS_PROCESSED = "processed"
STATUS_CLOSED = "closed"
STATUS_CANCELLED = "cancelled"

ALL_STATUSES = [
    STATUS_REGISTERED,
    STATUS_UNDER_REVIEW,
    STATUS_PROCESSED,
    STATUS_CLOSED,
    STATUS_CANCELLED,
]


# M2M между инцидентом и видами последствий
incident_consequences = Table(
    "incident_consequences",
    Base.metadata,
    Column("incident_id", ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True),
    Column("consequence_id", ForeignKey("consequences.id", ondelete="RESTRICT"), primary_key=True),
)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    occured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=STATUS_REGISTERED, index=True
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reopening_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    initiator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    severity_id: Mapped[int | None] = mapped_column(
        ForeignKey("severities.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="RESTRICT"), nullable=True
    )
    funnel_stage_id: Mapped[int] = mapped_column(
        ForeignKey("funnel_stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    initiator = relationship("User", lazy="joined", foreign_keys=[initiator_id])
    department = relationship("Department", lazy="joined")
    category = relationship("Category", lazy="joined")
    severity = relationship("Severity", lazy="joined")
    source = relationship("Source", lazy="joined")
    funnel_stage = relationship("FunnelStage", lazy="joined")
    consequences = relationship("Consequence", secondary=incident_consequences, lazy="selectin")
    status_history = relationship(
        "StatusHistory",
        back_populates="incident",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    comments = relationship(
        "Comment", back_populates="incident", lazy="selectin", cascade="all, delete-orphan"
    )
    attachments = relationship(
        "Attachment", back_populates="incident", lazy="selectin", cascade="all, delete-orphan"
    )


class StatusHistory(Base):
    __tablename__ = "status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_status: Mapped[str] = mapped_column(String(32), nullable=False)
    transition_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    initiator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    incident = relationship("Incident", back_populates="status_history")
    initiator = relationship("User", lazy="joined")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    incident = relationship("Incident", back_populates="comments")
    author = relationship("User", lazy="joined")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    uploader_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    incident = relationship("Incident", back_populates="attachments")
    uploader = relationship("User", lazy="joined")
