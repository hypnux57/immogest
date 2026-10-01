import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import models, schemas
from .auth import check_credentials, create_token
from .database import Base, engine
from .routers import dashboard, paiements_extra
from .routers.crud import crud_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ImmoGest API", version="1.0")

origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login", response_model=schemas.TokenOut)
def login(data: schemas.LoginIn):
    if not check_credentials(data.username, data.password):
        raise HTTPException(401, "Identifiant ou mot de passe incorrect")
    return schemas.TokenOut(access_token=create_token(data.username))


# Les routes spécifiques aux paiements doivent passer avant le CRUD générique
app.include_router(paiements_extra.router)
app.include_router(dashboard.router)
app.include_router(crud_router("/biens", models.Bien, schemas.BienIn, schemas.BienOut, models.Bien.nom, "Bien"))
app.include_router(crud_router("/locataires", models.Locataire, schemas.LocataireIn, schemas.LocataireOut, models.Locataire.nom, "Locataire"))
app.include_router(crud_router("/paiements", models.Paiement, schemas.PaiementIn, schemas.PaiementOut, models.Paiement.mois.desc(), "Paiement"))
app.include_router(crud_router("/charges", models.Charge, schemas.ChargeIn, schemas.ChargeOut, models.Charge.date.desc(), "Dépense"))
