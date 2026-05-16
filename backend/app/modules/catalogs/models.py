from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class _CatalogBase:
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Department(_CatalogBase, Base):
    __tablename__ = "departments"


class Severity(_CatalogBase, Base):
    __tablename__ = "severities"
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    order_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Category(_CatalogBase, Base):
    __tablename__ = "categories"


class Source(_CatalogBase, Base):
    __tablename__ = "sources"
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)


class FunnelStage(_CatalogBase, Base):
    __tablename__ = "funnel_stages"
    order_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Consequence(_CatalogBase, Base):
    __tablename__ = "consequences"
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)


class IncidentTemplate(Base):
    __tablename__ = "incident_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    severity_id: Mapped[int | None] = mapped_column(ForeignKey("severities.id", ondelete="SET NULL"))
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id", ondelete="SET NULL"))
    funnel_stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("funnel_stages.id", ondelete="SET NULL")
    )
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category = relationship("Category", lazy="joined")
    severity = relationship("Severity", lazy="joined")
    source = relationship("Source", lazy="joined")
    funnel_stage = relationship("FunnelStage", lazy="joined")
