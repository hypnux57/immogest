// Production : l'adresse de l'API est injectée automatiquement depuis la variable GitHub API_URL
// au moment du déploiement (voir .github/workflows/deploy-frontend.yml).
export const environment = {
  production: true,
  apiUrl: '__API_URL__',
};
