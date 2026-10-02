import datetime as dt
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BienIn(BaseModel):
    nom: str = Field(min_length=1, max_length=200)
    type: str = "Appartement"
    surface: float = 0
    loyer: float = 0
    charges_mens: float = 0
    credit_mens: float = 0
    taxe_fonciere: float = 0
    assurance_pno: float = 0
    annee_achat: Optional[int] = None
    prix_achat: float = 0
    valeur_actuelle: float = 0
    statut: Literal["Loué", "Vacant", "Travaux"] = "Loué"
    notes: str = ""


class BienOut(BienIn, ORM):
    id: int


class LocataireIn(BaseModel):
    prenom: str = Field(min_length=1, max_length=100)
    nom: str = ""
    email: str = ""
    tel: str = ""
    bien_id: int
    loyer: float = 0
    depot: float = 0
    echeance: int = Field(default=5, ge=1, le=28)
    debut: Optional[dt.date] = None
    fin: Optional[dt.date] = None
    notes: str = ""


class LocataireOut(LocataireIn, ORM):
    id: int


class PaiementIn(BaseModel):
    locataire_id: int
    mois: str = Field(pattern=r"^\d{4}-\d{2}$")
    montant: float = 0
    date_paiement: Optional[dt.date] = None
    statut: Literal["Payé", "En attente", "En retard"] = "En attente"


class PaiementOut(PaiementIn, ORM):
    id: int


class ChargeIn(BaseModel):
    bien_id: int
    categorie: str = "Autre"
    description: str = ""
    montant: float = 0
    date: dt.date


class ChargeOut(ChargeIn, ORM):
    id: int


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
