from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, UserRole
from app.schemas.user import UserUpdate, UserRoleUpdate
from app.repositories.user_repository import UserRepository


class UserService:
    def __init__(self, db: AsyncSession):
        self.repository = UserRepository(db)

    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        return await self.repository.get_by_id(user_id)

    async def get_user_by_email(self, email: str) -> Optional[User]:
        return await self.repository.get_by_email(email)

    async def get_users(self, skip: int = 0, limit: int = 100):
        return await self.repository.get_all(skip=skip, limit=limit)

    async def update_user(
        self, db_obj: User, user_in: UserUpdate | UserRoleUpdate
    ) -> User:
        """Applies a partial update on db_obj from the given Pydantic schema."""
        update_data = user_in.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        return await self.repository.update(db_obj)

    async def delete_user(self, db_obj: User) -> None:
        await self.repository.delete(db_obj)

    async def find_or_create_google_user(
        self, email: str, google_id: str, name: str, picture: str | None
    ) -> User:
        """Find user by email or create new Google OAuth user.

        If user exists, update their Google profile data.
        If not, create a new user with auth_provider='google'.
        """
        user = await self.repository.get_by_email(email)
        if user:
            user.google_id = google_id
            user.name = name
            user.picture = picture
            user.auth_provider = "google"
            return await self.repository.update(user)

        db_obj = User(
            email=email,
            google_id=google_id,
            name=name,
            picture=picture,
            auth_provider="google",
            is_active=True,
            role=UserRole.USER,
        )
        return await self.repository.create(db_obj)
