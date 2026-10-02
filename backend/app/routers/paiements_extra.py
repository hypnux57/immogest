import calendar
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_user
from ..database import get_db
from ..models import Locataire, Paiement
from ..schemas import PaiementOut

router = APIRouter(prefix="/paiements", tags=["paiements"], dependencies=[Depends(require_user)])


@router.get("/mois/{mois}", response_model=list[PaiementOut])
def by_month(mois: str, db: Session = Depends(get_db)):
    return db.scalars(select(Paiement).where(Paiement.mois == mois)).all()


@router.post("/generer", response_model=list[PaiementOut])
def generate(mois: str = Query(pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Crée une échéance "En attente" pour chaque locataire dont le bail couvre ce mois et qui n'en a pas encore."""
    y, m = int(mois[:4]), int(mois[5:7])
    premier = date(y, m, 1)
    dernier = date(y, m, calendar.monthrange(y, m)[1])
    existing = {p.locataire_id for p in db.scalars(select(Paiement).where(Paiement.mois == mois))}
    created = []
    for loc in db.scalars(select(Locataire)):
        en_cours = (loc.debut is None or loc.debut <= dernier) and (loc.fin is None or loc.fin >= premier)
        if en_cours and loc.id not in existing:
            p = Paiement(locataire_id=loc.id, mois=mois, montant=loc.loyer, statut="En attente")
            db.add(p)
            created.append(p)
    db.commit()
    for p in created:
        db.refresh(p)
    return created


@router.post("/{paiement_id}/payer", response_model=PaiementOut)
def mark_paid(paiement_id: int, db: Session = Depends(get_db)):
    p = db.get(Paiement, paiement_id)
    if p is None:
        raise HTTPException(404, "Paiement introuvable")
    p.statut = "Payé"
    p.date_paiement = date.today()
    db.commit()
    db.refresh(p)
    return p
