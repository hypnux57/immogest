from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_user
from ..database import get_db
from ..models import Bien, Locataire, Paiement, Charge

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_user)])


def _last_months(n: int) -> list[str]:
    today = date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(out))


@router.get("")
def dashboard(db: Session = Depends(get_db)):
    biens = db.scalars(select(Bien).order_by(Bien.nom)).all()
    locataires = db.scalars(select(Locataire)).all()
    months = _last_months(12)
    paiements = db.scalars(select(Paiement).where(Paiement.mois.in_(months))).all()
    charges = db.scalars(select(Charge).where(Charge.date >= date.fromisoformat(months[0] + "-01"))).all()

    current = months[-1]
    today = date.today()
    # Baux en cours : commencés (ou sans date) et pas encore terminés
    actifs = [l for l in locataires if (l.debut is None or l.debut <= today) and (l.fin is None or l.fin >= today)]
    loc_bien = {loc.id: loc.bien_id for loc in locataires}

    # Grille "registre" : statut de chaque bien pour chaque mois
    grid = []
    for b in biens:
        row = {"bien_id": b.id, "nom": b.nom, "cells": []}
        for mo in months:
            ps = [p for p in paiements if p.mois == mo and loc_bien.get(p.locataire_id) == b.id]
            if not ps:
                status = "vide"
            elif all(p.statut == "Payé" for p in ps):
                status = "paye"
            elif any(p.statut == "En retard" for p in ps):
                status = "retard"
            else:
                status = "attente"
            row["cells"].append({"mois": mo, "statut": status, "montant": float(sum(p.montant for p in ps))})
        grid.append(row)

    revenus_mois = []
    charges_mois = []
    for mo in months:
        revenus_mois.append(float(sum(p.montant for p in paiements if p.mois == mo and p.statut == "Payé")))
        charges_mois.append(float(sum(c.montant for c in charges if c.date.strftime("%Y-%m") == mo)))

    loyers_attendus = float(sum(l.loyer for l in actifs))
    credits = float(sum(b.credit_mens for b in biens))
    charges_fixes = float(sum(b.charges_mens for b in biens)) + float(sum(b.taxe_fonciere for b in biens)) / 12
    cur = [p for p in paiements if p.mois == current]

    return {
        "mois_courant": current,
        "mois": months,
        "loyers_attendus": loyers_attendus,
        "encaisse_mois": float(sum(p.montant for p in cur if p.statut == "Payé")),
        "attente_mois": float(sum(p.montant for p in cur if p.statut != "Payé")),
        "credits_mensuels": credits,
        "charges_fixes_mensuelles": round(charges_fixes, 2),
        "cashflow_mensuel": round(loyers_attendus - credits - charges_fixes, 2),
        "biens_loues": sum(1 for b in biens if b.statut == "Loué"),
        "biens_total": len(biens),
        "revenus_mois": revenus_mois,
        "charges_mois": charges_mois,
        "registre": grid,
        "baux_a_echeance": [
            {"locataire_id": l.id, "nom": f"{l.prenom} {l.nom}".strip(), "fin": l.fin.isoformat()}
            for l in actifs
            if l.fin and 0 <= (l.fin - today).days <= 90
        ],
    }
