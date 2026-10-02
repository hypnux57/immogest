import datetime as dt
from typing import Optional
from sqlalchemy import ForeignKey, String, Numeric, Integer, Date, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Bien(Base):
    __tablename__ = "biens"
    id: Mapped[int] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50), default="Appartement")
    surface: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    loyer: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    charges_mens: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    credit_mens: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    taxe_fonciere: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    assurance_pno: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    annee_achat: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    prix_achat: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    valeur_actuelle: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    interets_annuels: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    quote_part: Mapped[float] = mapped_column(Numeric(5, 2), default=100)
    adresse: Mapped[str] = mapped_column(String(250), default="")
    code_postal: Mapped[str] = mapped_column(String(10), default="")
    ville: Mapped[str] = mapped_column(String(120), default="")
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    statut: Mapped[str] = mapped_column(String(30), default="Loué")
    notes: Mapped[str] = mapped_column(Text, default="")

    locataires = relationship("Locataire", back_populates="bien", cascade="all, delete-orphan")
    charges = relationship("Charge", back_populates="bien", cascade="all, delete-orphan")


class Locataire(Base):
    __tablename__ = "locataires"
    id: Mapped[int] = mapped_column(primary_key=True)
    prenom: Mapped[str] = mapped_column(String(100))
    nom: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    tel: Mapped[str] = mapped_column(String(50), default="")
    bien_id: Mapped[int] = mapped_column(ForeignKey("biens.id", ondelete="CASCADE"))
    loyer: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    depot: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    echeance: Mapped[int] = mapped_column(Integer, default=5)
    debut: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    fin: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    bien = relationship("Bien", back_populates="locataires")
    paiements = relationship("Paiement", back_populates="locataire", cascade="all, delete-orphan")


class Paiement(Base):
    __tablename__ = "paiements"
    id: Mapped[int] = mapped_column(primary_key=True)
    locataire_id: Mapped[int] = mapped_column(ForeignKey("locataires.id", ondelete="CASCADE"))
    mois: Mapped[str] = mapped_column(String(7), index=True)  # AAAA-MM
    montant: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    date_paiement: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    statut: Mapped[str] = mapped_column(String(20), default="En attente")

    locataire = relationship("Locataire", back_populates="paiements")


class Charge(Base):
    __tablename__ = "charges"
    id: Mapped[int] = mapped_column(primary_key=True)
    bien_id: Mapped[int] = mapped_column(ForeignKey("biens.id", ondelete="CASCADE"))
    categorie: Mapped[str] = mapped_column(String(50), default="Autre")
    description: Mapped[str] = mapped_column(Text, default="")
    montant: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    date: Mapped[dt.date] = mapped_column(Date)

    bien = relationship("Bien", back_populates="charges")
