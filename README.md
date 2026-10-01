# ImmoGest

Application de gestion locative : biens, locataires, loyers et dépenses.

L'application est en trois morceaux, chacun hébergé gratuitement :

| Morceau | Technologie | Hébergement |
|---|---|---|
| Site web (ce que vous voyez) | Angular | GitHub Pages |
| API (la logique et la sécurité) | Python, FastAPI | Render |
| Base de données | PostgreSQL | Neon |

GitHub Pages ne sait servir que des fichiers statiques. Le site appelle donc l'API Python, qui lit et écrit dans PostgreSQL.

## Mise en ligne

1. **Base** : dans l'éditeur SQL de Neon, exécutez `backend/sql/schema.sql` (puis vos données d'import, gardées hors du dépôt).
2. **API** : Render > New > Blueprint > ce dépôt (lit `render.yaml`). Variables : `DATABASE_URL`, `APP_USER`, `APP_PASSWORD`, `CORS_ORIGINS` (`https://VOTRE-COMPTE.github.io`). `JWT_SECRET` est généré automatiquement. Vérifiez `/health`.
3. **Site** : Settings > Pages > Source : GitHub Actions ; Settings > Secrets and variables > Actions > Variables : `API_URL` = adresse de l'API Render. Chaque modification de `frontend/` redéploie le site.

L'offre gratuite de Render met l'API en veille après 15 minutes d'inactivité ; la première ouverture ensuite prend environ une minute.

## Travailler en local

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env   # puis remplissez .env
uvicorn app.main:app --reload        # API sur http://localhost:8000/docs

cd frontend && npm install && npx ng serve   # site sur http://localhost:4200
```

## Sécurité

- Toutes les routes de l'API, sauf `/health` et `/auth/login`, exigent d'être connecté.
- Le mot de passe n'est jamais dans le code : il est uniquement dans les variables Render.
- L'API n'accepte que les appels venant de votre adresse GitHub Pages (`CORS_ORIGINS`).
- Ne mettez jamais `backend/.env` sur GitHub (exclu par `.gitignore`).
