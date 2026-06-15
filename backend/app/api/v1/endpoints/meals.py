from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_meal_service
from app.core.exceptions import NotFoundException
from app.schemas.meal import MealResponse, MealCreate, MealUpdate
from app.services.meal_service import MealService
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[MealResponse])
async def read_meals(
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    meal_service: MealService = Depends(get_meal_service),
):
    """Retrieve meals (paginated)."""
    return await meal_service.get_meals(skip=skip, limit=limit)


@router.post("/", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
async def create_meal(
    meal_in: MealCreate,
    itinerary_day_id: UUID,
    current_user: User = Depends(get_current_user),
    meal_service: MealService = Depends(get_meal_service),
):
    """Creates a new meal."""
    return await meal_service.create_meal(
        meal_in=meal_in, itinerary_day_id=itinerary_day_id
    )


@router.get("/{meal_id}", response_model=MealResponse)
async def read_meal(
    meal_id: UUID,
    current_user: User = Depends(get_current_user),
    meal_service: MealService = Depends(get_meal_service),
):
    """Get a specific meal by ID."""
    meal = await meal_service.get_meal_by_id(meal_id=meal_id)
    if not meal:
        raise NotFoundException(detail="Meal not found")
    return meal


@router.put("/{meal_id}", response_model=MealResponse)
async def update_meal(
    meal_id: UUID,
    meal_in: MealUpdate,
    current_user: User = Depends(get_current_user),
    meal_service: MealService = Depends(get_meal_service),
):
    """Update a meal."""
    meal = await meal_service.get_meal_by_id(meal_id=meal_id)
    if not meal:
        raise NotFoundException(detail="Meal not found")
    return await meal_service.update_meal(db_obj=meal, meal_in=meal_in)


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal(
    meal_id: UUID,
    current_user: User = Depends(get_current_user),
    meal_service: MealService = Depends(get_meal_service),
):
    """Delete a meal."""
    meal = await meal_service.get_meal_by_id(meal_id=meal_id)
    if not meal:
        raise NotFoundException(detail="Meal not found")
    await meal_service.delete_meal(db_obj=meal)
    return None
