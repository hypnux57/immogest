"""Fabrique de routes CRUD génériques pour éviter de répéter le même code 4 fois."""
from typing import Type
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_user
from ..database import get_db


def crud_router(prefix: str, model, schema_in: Type[BaseModel], schema_out: Type[BaseModel],
                order_by=None, label: str = "Élément") -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[prefix.strip("/")], dependencies=[Depends(require_user)])

    @router.get("", response_model=list[schema_out])
    def list_items(db: Session = Depends(get_db)):
        stmt = select(model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        return db.scalars(stmt).all()

    @router.get("/{item_id}", response_model=schema_out)
    def get_item(item_id: int, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if obj is None:
            raise HTTPException(404, f"{label} introuvable")
        return obj

    @router.post("", response_model=schema_out, status_code=201)
    def create_item(data: schema_in, db: Session = Depends(get_db)):  # type: ignore[valid-type]
        obj = model(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.put("/{item_id}", response_model=schema_out)
    def update_item(item_id: int, data: schema_in, db: Session = Depends(get_db)):  # type: ignore[valid-type]
        obj = db.get(model, item_id)
        if obj is None:
            raise HTTPException(404, f"{label} introuvable")
        for key, value in data.model_dump().items():
            setattr(obj, key, value)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: int, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if obj is None:
            raise HTTPException(404, f"{label} introuvable")
        db.delete(obj)
        db.commit()

    return router
