from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_user
from ..database import get_db
from ..models import Bien, Charge
from ..schemas import ChargeIn

router = APIRouter(prefix="/charges", tags=["charges"], dependencies=[Depends(require_user)])


class LotIn(BaseModel):
    depenses: list[ChargeIn] = Field(min_length=1, max_length=2000)


@router.post("/lot", status_code=201)
def importer_lot(lot: LotIn, db: Session = Depends(get_db)):
    """Enregistre plusieurs dépenses d'un coup (import Excel), en une seule transaction."""
    ids_biens = set(db.scalars(select(Bien.id)))
    inconnus = {d.bien_id for d in lot.depenses} - ids_biens
    if inconnus:
        raise HTTPException(422, f"Bien(s) introuvable(s) : {', '.join(map(str, sorted(inconnus)))}")
    db.add_all([Charge(**d.model_dump()) for d in lot.depenses])
    db.commit()
    return {"importees": len(lot.depenses)}
