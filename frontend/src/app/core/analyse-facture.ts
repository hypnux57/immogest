/**
 * Lecture automatique d'une facture : montant, date, catégorie, bien et part déductible
 * des revenus fonciers (régime réel, déclaration 2044). Heuristiques, à vérifier par l'utilisateur.
 */
import { Bien } from './models';

export const sansAccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export interface Analyse {
  montant: number | null;
  ligneMontant: string;
  date: string | null;
  fournisseur: string;
  numero: string;
  categorie: string;
  bien_id: number | null;
  montant_deductible: number | null;
  motif: string;
  aVerifier: boolean;
}

const MONTANT = /(-?\d{1,3}(?:[ .\u00a0\u202f]\d{3})+|-?\d+)[,.](\d{2})(?!\d)/g;
const MOIS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

/** Libellés qui désignent le montant à payer, par ordre de fiabilité. */
const LIBELLES_TOTAL: [RegExp, number][] = [
  [/net a payer|montant net a payer/, 10],
  [/montant (de votre impot|a payer|du)\b|somme a payer|reste a payer|solde a payer/, 9],
  [/total t\.?t\.?c|montant t\.?t\.?c|total toutes taxes/, 9],
  [/montant de l.?appel|total de l.?appel|appel de fonds/, 8],
  [/total a regler|a regler/, 8],
  [/\btotal\b/, 5],
  [/\bmontant\b/, 3],
];

export function montantsDe(ligne: string): number[] {
  const out: number[] = [];
  for (const m of ligne.matchAll(MONTANT)) {
    const n = Number(m[1].replace(/[ .\u00a0\u202f]/g, '') + '.' + m[2]);
    if (isFinite(n)) out.push(Math.abs(n));
  }
  return out;
}

function trouverMontant(lignes: string[]): { montant: number | null; ligne: string } {
  let meilleur = { score: 0, montant: null as number | null, ligne: '' };
  lignes.forEach((ligne, i) => {
    const n = sansAccent(ligne);
    if (/\bh\.?t\.?\b|hors taxe|tva\b|acompte|deja regle|deja paye/.test(n) && !/t\.?t\.?c/.test(n)) return;
    for (const [re, score] of LIBELLES_TOTAL) {
      if (!re.test(n)) continue;
      // Le montant est sur la ligne, ou sur la suivante quand le libellé est seul
      let montants = montantsDe(ligne);
      let source = ligne;
      if (!montants.length && lignes[i + 1]) { montants = montantsDe(lignes[i + 1]); source = `${ligne} ${lignes[i + 1]}`; }
      if (montants.length && score > meilleur.score) meilleur = { score, montant: montants[montants.length - 1], ligne: source.trim() };
      break;
    }
  });
  if (meilleur.montant !== null) return { montant: meilleur.montant, ligne: meilleur.ligne };
  // À défaut : le plus gros montant du document
  const tous = lignes.flatMap((l) => montantsDe(l).map((m) => ({ m, l })));
  if (!tous.length) return { montant: null, ligne: '' };
  const max = tous.reduce((a, b) => (b.m > a.m ? b : a));
  return { montant: max.m, ligne: max.l.trim() };
}

function trouverDate(lignes: string[]): string | null {
  const iso = (j: number, m: number, a: number) => {
    if (a < 100) a += 2000;
    const d = new Date(a, m - 1, j);
    return d.getMonth() === m - 1 && a > 2000 && a < 2100 ? `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null;
  };
  const extraire = (l: string): string | null => {
    const n = sansAccent(l);
    let m = n.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
    if (m) { const r = iso(+m[1], +m[2], +m[3]); if (r) return r; }
    m = n.match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
    if (m) return iso(+m[1], MOIS[m[2]], +m[3]);
    return null;
  };
  // D'abord les lignes qui parlent de la date de la facture, puis la première date venue
  const prioritaires = lignes.filter((l) => /date (de (la )?)?(facture|emission|l.?avis|d.?etablissement)|facture du|emise? le|fait le/.test(sansAccent(l)));
  for (const l of [...prioritaires, ...lignes]) { const d = extraire(l); if (d) return d; }
  return null;
}

const MOTS_CATEGORIE: [string, RegExp][] = [
  ['Taxe foncière', /taxes? foncieres?|avis d.?impot.*foncier/],
  ['Charges communes', /syndic|copropriete|appel de fonds|appel de charges|charges courantes|budget previsionnel/],
  ['Gestion locative', /agence immobiliere|gestion locative|honoraires de gestion|frais de location|etat des lieux|mandat de gestion/],
  ['Assurance', /assurance|proprietaire non occupant|\bpno\b|garantie loyers? impayes|\bgli\b/],
  ['Équipement', /mobilier|meuble|electromenager|canape|literie|refrigerateur|lave.?linge|lave.?vaisselle|four\b|television/],
  ['Entretien', /entretien|ramonage|contrat de maintenance|nettoyage|vidange|desinsectisation|depannage/],
  ['Travaux', /travaux|renovation|plomberie|plombier|electricite|electricien|peinture|menuiserie|carrelage|maconnerie|chauffe.?eau|toiture|couverture|isolation|fenetre|volet|serrurerie|devis|main d.?oeuvre|fourniture et pose/],
];

export function devinerCategorie(texte: string): string {
  const t = sansAccent(texte);
  for (const [cat, re] of MOTS_CATEGORIE) if (re.test(t)) return cat;
  return 'Autre';
}

export function devinerBien(texte: string, biens: Bien[]): number | null {
  const t = sansAccent(texte);
  const mots = new Map<number, string[]>();
  const compte = new Map<string, number>();
  for (const b of biens) {
    const m = [...new Set(sansAccent(`${b.nom} ${b.adresse}`).split(/[^a-z0-9]+/).filter((x) => x.length >= 4))];
    mots.set(b.id, m);
    m.forEach((x) => compte.set(x, (compte.get(x) ?? 0) + 1));
  }
  let meilleur: number | null = null;
  let score = 0;
  for (const b of biens) {
    // L'adresse complète vaut plus qu'un simple mot
    const adresse = sansAccent(b.adresse || '').trim();
    let s = adresse.length > 6 && t.includes(adresse) ? 3 : 0;
    s += mots.get(b.id)!.filter((x) => compte.get(x) === 1 && t.includes(x)).length;
    if (s > score) { score = s; meilleur = b.id; }
  }
  return meilleur;
}

/** Montant d'une ligne dont le libellé correspond (ex. TEOM, charges récupérables). */
function montantLigne(lignes: string[], re: RegExp): { montant: number; ligne: string } | null {
  for (let i = 0; i < lignes.length; i++) {
    if (!re.test(sansAccent(lignes[i]))) continue;
    let m = montantsDe(lignes[i]);
    if (!m.length && lignes[i + 1]) m = montantsDe(lignes[i + 1]);
    if (m.length) return { montant: m[m.length - 1], ligne: lignes[i].trim() };
  }
  return null;
}

/** Part déductible au régime réel (2044), selon la catégorie et le contenu de la facture. */
export function partDeductible(categorie: string, montant: number | null, texte: string, lignes: string[]): { deductible: number | null; motif: string; aVerifier: boolean } {
  if (montant === null) return { deductible: null, motif: '', aVerifier: true };
  const t = sansAccent(texte);
  const arrondi = (n: number) => Math.round(Math.max(0, n) * 100) / 100;
  switch (categorie) {
    case 'Taxe foncière': {
      const teom = montantLigne(lignes, /ordures menageres|\bteom\b/);
      return teom && teom.montant < montant
        ? { deductible: arrondi(montant - teom.montant), motif: `Taxe foncière déductible (ligne 227), hors taxe d’ordures ménagères de ${teom.montant.toFixed(2).replace('.', ',')} € récupérable sur le locataire.`, aVerifier: false }
        : { deductible: montant, motif: 'Taxe foncière déductible (ligne 227). Retirez la taxe d’ordures ménagères si vous la refacturez au locataire.', aVerifier: true };
    }
    case 'Charges communes': {
      const recup = montantLigne(lignes, /charges? recuperables?|dont recuperable|part locative|quote.?part locataire/);
      return recup && recup.montant < montant
        ? { deductible: arrondi(montant - recup.montant), motif: `Provisions de copropriété (ligne 229), hors ${recup.montant.toFixed(2).replace('.', ',')} € de charges récupérables sur le locataire.`, aVerifier: false }
        : { deductible: montant, motif: 'Provisions de copropriété déductibles (ligne 229). La part récupérable sur le locataire sera à réintégrer lors de la régularisation (ligne 230).', aVerifier: true };
    }
    case 'Assurance':
      return /emprunteur|deces.?invalidite|pret immobilier/.test(t)
        ? { deductible: montant, motif: 'Assurance emprunteur : déductible avec les intérêts d’emprunt (ligne 250).', aVerifier: false }
        : { deductible: montant, motif: 'Prime d’assurance déductible (ligne 223).', aVerifier: false };
    case 'Gestion locative':
      return { deductible: montant, motif: 'Frais de gestion et honoraires déductibles (ligne 221).', aVerifier: false };
    case 'Entretien':
      return { deductible: montant, motif: 'Dépense d’entretien déductible (ligne 224).', aVerifier: false };
    case 'Travaux':
      return /construction|reconstruction|agrandissement|extension|surelevation|creation de surface|permis de construire/.test(t)
        ? { deductible: 0, motif: 'Travaux de construction, reconstruction ou agrandissement : non déductibles des revenus fonciers.', aVerifier: true }
        : { deductible: montant, motif: 'Travaux de réparation, d’entretien ou d’amélioration déductibles (ligne 224).', aVerifier: false };
    case 'Équipement':
      return /mobilier|meuble|canape|literie|refrigerateur|lave.?linge|lave.?vaisselle|television|electromenager/.test(t)
        ? { deductible: 0, motif: 'Mobilier et électroménager : non déductibles en location nue (ils le seraient en meublé, par amortissement).', aVerifier: true }
        : { deductible: montant, motif: 'Équipement fixe assimilé à une amélioration, déductible (ligne 224). À vérifier selon sa nature.', aVerifier: true };
    default:
      return { deductible: montant, motif: 'Catégorie non reconnue : vérifiez si la dépense est déductible.', aVerifier: true };
  }
}

export function analyserTexte(texte: string, biens: Bien[]): Analyse {
  const lignes = texte.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const { montant, ligne } = trouverMontant(lignes);
  const categorie = devinerCategorie(texte);
  const numero = (texte.match(/(?:facture|avis|appel)\s*(?:n[°o]|num[eé]ro)\s*:?\s*([A-Z0-9\-\/]{3,})/i) || [])[1] || '';
  const fournisseur = lignes.find((l) => /[a-z]{3}/i.test(l) && !/facture|devis|date|page|client/i.test(l) && l.length <= 60) || '';
  const d = partDeductible(categorie, montant, texte, lignes);
  return {
    montant, ligneMontant: ligne, date: trouverDate(lignes), fournisseur, numero, categorie,
    bien_id: devinerBien(texte, biens),
    montant_deductible: d.deductible, motif: d.motif, aVerifier: d.aVerifier || montant === null,
  };
}
