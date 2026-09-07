"""Google sign-in: exchange a Google ID token for one of our JWTs."""

from fastapi import APIRouter, Depends

from core_api.api.deps import get_sign_in
from core_api.schemas.user import AuthUser, GoogleAuthRequest, GoogleAuthResponse
from core_api.services.auth_service import SignIn

router = APIRouter()


@router.post("/google", response_model=GoogleAuthResponse)
async def google_auth(
    body: GoogleAuthRequest, sign_in: SignIn = Depends(get_sign_in)
) -> GoogleAuthResponse:
    """Verify the Google credential, upsert the user and issue our JWT."""
    result = await sign_in(body.credential)
    return GoogleAuthResponse(
        access_token=result.access_token, user=AuthUser.model_validate(result.user)
    )
