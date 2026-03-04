from pydantic import BaseModel


class UserInfo(BaseModel):
    sub: str


class AccessTokenInfo(BaseModel):
    pass


def authenticated():
    return None


def current_user():
    return None


def current_user_optional():
    return None


def parse_ws_bearer_token(websocket):
    return None, None


async def current_user_ws_optional(websocket):
    return None


async def verify_raw_token(token):
    """Verify a raw JWT token string (used for query-param auth fallback)."""
    return None
