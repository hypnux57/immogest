-- Schéma ImmoGest (PostgreSQL). L'API crée aussi ces tables automatiquement au démarrage.
CREATE TABLE IF NOT EXISTS biens (
    id             SERIAL PRIMARY KEY,
    nom            VARCHAR(200) NOT NULL,
    type           VARCHAR(50)  NOT NULL DEFAULT 'Appartement',
    surface        NUMERIC(8,2)  NOT NULL DEFAULT 0,
    loyer          NUMERIC(10,2) NOT NULL DEFAULT 0,
    charges_mens   NUMERIC(10,2) NOT NULL DEFAULT 0,
    credit_mens    NUMERIC(10,2) NOT NULL DEFAULT 0,
    taxe_fonciere  NUMERIC(10,2) NOT NULL DEFAULT 0,
    statut         VARCHAR(30)  NOT NULL DEFAULT 'Loué',
    notes          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS locataires (
    id        SERIAL PRIMARY KEY,
    prenom    VARCHAR(100) NOT NULL,
    nom       VARCHAR(100) NOT NULL DEFAULT '',
    email     VARCHAR(200) NOT NULL DEFAULT '',
    tel       VARCHAR(50)  NOT NULL DEFAULT '',
    bien_id   INTEGER NOT NULL REFERENCES biens(id) ON DELETE CASCADE,
    loyer     NUMERIC(10,2) NOT NULL DEFAULT 0,
    depot     NUMERIC(10,2) NOT NULL DEFAULT 0,
    echeance  INTEGER NOT NULL DEFAULT 5,
    debut     DATE,
    fin       DATE,
    notes     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS paiements (
    id             SERIAL PRIMARY KEY,
    locataire_id   INTEGER NOT NULL REFERENCES locataires(id) ON DELETE CASCADE,
    mois           VARCHAR(7) NOT NULL,
    montant        NUMERIC(10,2) NOT NULL DEFAULT 0,
    date_paiement  DATE,
    statut         VARCHAR(20) NOT NULL DEFAULT 'En attente'
);
CREATE INDEX IF NOT EXISTS ix_paiements_mois ON paiements (mois);

CREATE TABLE IF NOT EXISTS charges (
    id           SERIAL PRIMARY KEY,
    bien_id      INTEGER NOT NULL REFERENCES biens(id) ON DELETE CASCADE,
    categorie    VARCHAR(50) NOT NULL DEFAULT 'Autre',
    description  TEXT NOT NULL DEFAULT '',
    montant      NUMERIC(10,2) NOT NULL DEFAULT 0,
    date         DATE NOT NULL
);
