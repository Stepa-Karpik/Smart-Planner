from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

class DocumentEventCreate(BaseModel):
    owner_subject_id: UUID
    calendar_title: str = 'Документы'
    title: str
    starts_at: datetime
    description: str = ''
    priority: str | int = 0
