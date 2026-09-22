from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial
from core_api.schemas._types import CitySlug, Title


class ChatThreadBase(BaseModel):
    title: Title | None = None
    city: CitySlug | None = None


class ChatThreadCreate(ChatThreadBase):
    pass


ChatThreadUpdate = partial(ChatThreadBase, "ChatThreadUpdate")


class ChatThreadResponse(ChatThreadBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
