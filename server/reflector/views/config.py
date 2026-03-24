from fastapi import APIRouter
from pydantic import BaseModel

from reflector.email import is_email_configured
from reflector.settings import settings

router = APIRouter()


class ConfigResponse(BaseModel):
    zulip_enabled: bool
    email_enabled: bool


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(
        zulip_enabled=bool(settings.ZULIP_REALM),
        email_enabled=is_email_configured(),
    )
