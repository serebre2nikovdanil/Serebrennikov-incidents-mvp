from pydantic import BaseModel, ConfigDict, Field


class CatalogBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    is_active: bool


class CatalogWithCode(CatalogBase):
    code: str


class CatalogWithOrder(CatalogBase):
    order_number: int


class CatalogWithCodeAndOrder(CatalogBase):
    code: str
    order_number: int


class CatalogCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    is_active: bool = True


class CatalogCreateWithCode(CatalogCreate):
    code: str = Field(min_length=1, max_length=32)


class CatalogCreateWithOrder(CatalogCreate):
    order_number: int = 0


class CatalogCreateWithCodeAndOrder(CatalogCreate):
    code: str = Field(min_length=1, max_length=32)
    order_number: int = 0


class CatalogUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    code: str | None = Field(default=None, min_length=1, max_length=32)
    order_number: int | None = None


class IncidentTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description_template: str | None = None
    category_id: int | None = None
    severity_id: int | None = None
    source_id: int | None = None
    funnel_stage_id: int | None = None
    owner_id: int | None = None
    is_active: bool


class IncidentTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description_template: str | None = None
    category_id: int | None = None
    severity_id: int | None = None
    source_id: int | None = None
    funnel_stage_id: int | None = None
    is_active: bool = True


class IncidentTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description_template: str | None = None
    category_id: int | None = None
    severity_id: int | None = None
    source_id: int | None = None
    funnel_stage_id: int | None = None
    is_active: bool | None = None
