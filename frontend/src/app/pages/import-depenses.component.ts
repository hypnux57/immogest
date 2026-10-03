import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Bien, Charge } from '../core/models';
import { EurPipe, dateFr, messageErreur } from '../core/format';

type Champ = 'date' | 'montant' | 'description' | 'categorie' | 'bien';

interface Ligne {
  inclus: boolean;
  date: string | null;      // AAAA-MM-JJ
  bien_id: number | null;
  categorie: string;
  description: string;
  montant: number | null;
  doublon: boolean;
  probleme: string;
}

/** Mots-clés reconnus dans les en-têtes de colonnes (sans accents, en minuscules). */
const ENTETES: Record<Champ, string[]> = {
  date: ['date', 'jour', 'echeance'],
  montant: ['montant', 'ttc', 'total', 'prix', 'somme', 'debit', 'cout', 'depense'],
  description: ['description', 'libelle', 'objet', 'fournisseur', 'intitule', 'detail', 'designation', 'commentaire'],
  categorie: ['categorie', 'type', 'nature', 'poste', 'rubrique'],
  bien: ['bien', 'logement', 'appartement', 'appart', 'adresse', 'immeuble', 'lot', 'propriete'],
};

/** Mots-clés pour deviner la catégorie à partir du libellé. L'ordre compte : le premier qui correspond gagne. */
const MOTS_CATEGORIE: [string, string[]][] = [
  ['Taxe foncière', ['taxe fonciere', 'fonciere', 'taxe ordures', 'teom']],
  ['Assurance', ['assurance', 'pno', 'gmf', 'axa', 'maif', 'macif', 'allianz', 'iard']],
  ['Charges communes', ['syndic', 'copro', 'appel de fonds', 'charges']],
  ['Gestion locative', ['agence', 'gestion', 'honoraires', 'frais de location', 'etat des lieux']],
  ['Entretien', ['entretien', 'chaudiere', 'ramonage', 'nettoyage', 'contrat', 'depannage', 'reparation']],
  ['Équipement', ['meuble', 'electromenager', 'cuisine equipee', 'equipement', 'mobilier', 'achat']],
  ['Travaux', ['travaux', 'renov', 'plomb', 'electric', 'peinture', 'menuis', 'carrel', 'macon', 'facade', 'toiture', 'plafond']],
];

const sansAccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

@Component({
  selector: 'app-import-depenses',
  standalone: true,
  imports: [FormsModule, EurPipe],
  styles: [`
    .etapes { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
    .fichier { position: relative; overflow: hidden; }
    .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .aide { color: var(--muted); font-size: 0.82rem; max-width: 75ch; margin-bottom: 1.25rem; }
    .colonnes { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem 1.25rem; margin: 1.5rem 0; }
    table.list select, table.list input { font: inherit; font-size: 0.82rem; border: 0; border-bottom: 1px solid var(--line); background: transparent; padding: 0.2rem 0; max-width: 100%; }
    table.list td { padding-top: 0.6rem; padding-bottom: 0.6rem; }
    tr.ignore td { opacity: 0.45; }
    input[type=checkbox] { accent-color: #000; width: 15px; height: 15px; }
    .resume { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem; }
    .resume strong { font-variant-numeric: tabular-nums; }
  `],
  template: `
    <section class="panel reveal" aria-label="Import de dépenses">
      <h2>Importer des dépenses depuis Excel</h2>
      <p class="aide">
        Fichier .xlsx, .xls ou .csv, une dépense par ligne. Les colonnes Date, Montant, Description, Catégorie et Bien sont reconnues automatiquement ;
        le bien est retrouvé à partir de son nom ou de son adresse, et la catégorie à partir du libellé (« syndic », « taxe foncière », « plombier »…).
        Vous pourrez tout vérifier avant d'importer.
      </p>

      <div class="etapes">
        <label class="btn primary fichier">
          {{ nomFichier ? 'Changer de fichier' : 'Choisir un fichier' }}
          <input type="file" accept=".xlsx,.xls,.csv,.ods" (change)="lireFichier($event)" aria-label="Fichier Excel des dépenses">
        </label>
        <button class="btn" type="button" (click)="telechargerModele()">Télécharger un modèle</button>
        <button class="btn" type="button" (click)="annuler.emit()">Fermer</button>
        @if (nomFichier) { <span class="secondary">{{ nomFichier }}</span> }
      </div>

      @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
      @if (chargement) { <p class="loading">Lecture du fichier…</p> }

      @if (entetes.length) {
        <div class="colonnes">
          @if (feuilles.length > 1) {
            <div class="field"><label for="i-feuille">Feuille</label>
              <select id="i-feuille" [(ngModel)]="feuille" (ngModelChange)="analyserFeuille()">
                @for (f of feuilles; track f) { <option [value]="f">{{ f }}</option> }
              </select>
            </div>
          }
          @for (c of champs; track c.cle) {
            <div class="field"><label [for]="'i-' + c.cle">Colonne {{ c.libelle }}</label>
              <select [id]="'i-' + c.cle" [(ngModel)]="correspondance[c.cle]" (ngModelChange)="convertir()">
                <option [ngValue]="-1">— aucune —</option>
                @for (e of entetes; track $index) { <option [ngValue]="$index">{{ e }}</option> }
              </select>
            </div>
          }
          <div class="field"><label for="i-defaut">Bien par défaut</label>
            <select id="i-defaut" [(ngModel)]="bienDefaut" (ngModelChange)="convertir()">
              <option [ngValue]="null">— à choisir ligne par ligne —</option>
              @for (b of biens; track b.id) { <option [ngValue]="b.id">{{ b.nom }}</option> }
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table class="list">
            <thead><tr>
              <th><input type="checkbox" [checked]="toutCoche()" (change)="toutCocher($any($event.target).checked)" aria-label="Tout cocher"></th>
              <th>Date</th><th>Bien</th><th>Catégorie</th><th>Description</th><th class="num">Montant</th><th>Contrôle</th>
            </tr></thead>
            <tbody>
              @for (l of lignes; track $index) {
                <tr [class.ignore]="!l.inclus">
                  <td><input type="checkbox" [(ngModel)]="l.inclus" [disabled]="!!l.probleme" [attr.aria-label]="'Importer la ligne ' + ($index + 1)"></td>
                  <td>{{ fr(l.date) }}</td>
                  <td>
                    <select [(ngModel)]="l.bien_id" (ngModelChange)="verifier(l)" [attr.aria-label]="'Bien de la ligne ' + ($index + 1)">
                      <option [ngValue]="null">— choisir —</option>
                      @for (b of biens; track b.id) { <option [ngValue]="b.id">{{ court(b.nom) }}</option> }
                    </select>
                  </td>
                  <td>
                    <select [(ngModel)]="l.categorie" [attr.aria-label]="'Catégorie de la ligne ' + ($index + 1)">
                      @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
                    </select>
                  </td>
                  <td><input [(ngModel)]="l.description" [attr.aria-label]="'Description de la ligne ' + ($index + 1)"></td>
                  <td class="num">{{ l.montant === null ? '—' : (l.montant | eur) }}</td>
                  <td>
                    @if (l.probleme) { <span class="badge retard">{{ l.probleme }}</span> }
                    @else if (l.doublon) { <span class="badge attente">Déjà saisie</span> }
                    @else { <span class="badge paye">OK</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="resume">
          <span class="secondary">
            {{ lignes.length }} lignes lues · {{ nbDoublons() }} déjà présentes · {{ nbProblemes() }} à corriger
          </span>
          <button class="btn primary" type="button" [disabled]="!aImporter().length || envoi" (click)="importer()">
            {{ envoi ? 'Import en cours…' : 'Importer ' + aImporter().length + ' dépense(s) · ' + (totalAImporter() | eur) }}
          </button>
        </div>
      }
    </section>
  `,
})
export class ImportDepensesComponent {
  private api = inject(ApiService);
  @Input() biens: Bien[] = [];
  @Input() charges: Charge[] = [];
  @Input() categories: string[] = [];
  @Output() termine = new EventEmitter<number>();
  @Output() annuler = new EventEmitter<void>();

  champs: { cle: Champ; libelle: string }[] = [
    { cle: 'date', libelle: 'date' }, { cle: 'montant', libelle: 'montant' }, { cle: 'description', libelle: 'description' },
    { cle: 'categorie', libelle: 'catégorie' }, { cle: 'bien', libelle: 'bien' },
  ];
  nomFichier = '';
  erreur = '';
  chargement = false;
  envoi = false;
  feuilles: string[] = [];
  feuille = '';
  entetes: string[] = [];
  correspondance: Record<Champ, number> = { date: -1, montant: -1, description: -1, categorie: -1, bien: -1 };
  bienDefaut: number | null = null;
  lignes: Ligne[] = [];

  private XLSX: any = null;
  private classeur: any = null;
  private donnees: unknown[][] = [];

  private async xlsx(): Promise<any> {
    if (!this.XLSX) {
      const mod: any = await import('xlsx');
      this.XLSX = mod.read ? mod : mod.default;
    }
    return this.XLSX;
  }

  async lireFichier(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;
    this.erreur = '';
    this.chargement = true;
    this.nomFichier = fichier.name;
    try {
      const XLSX = await this.xlsx();
      this.classeur = XLSX.read(await fichier.arrayBuffer(), { cellDates: true });
      this.feuilles = this.classeur.SheetNames;
      this.feuille = this.feuilles[0];
      this.analyserFeuille();
    } catch {
      this.erreur = 'Ce fichier ne peut pas être lu. Vérifiez qu’il s’agit bien d’un fichier Excel ou CSV.';
      this.entetes = [];
      this.lignes = [];
    } finally {
      this.chargement = false;
    }
  }

  analyserFeuille(): void {
    const XLSX = this.XLSX;
    const brut: unknown[][] = XLSX.utils.sheet_to_json(this.classeur.Sheets[this.feuille], { header: 1, raw: true, defval: null, blankrows: false });
    if (!brut.length) { this.erreur = 'Cette feuille est vide.'; this.entetes = []; this.lignes = []; return; }
    // La ligne d'en-têtes est la première (parmi les 10 premières) qui contient au moins deux libellés reconnus
    let iEntete = 0;
    for (let i = 0; i < Math.min(10, brut.length); i++) {
      const textes = brut[i].map((c) => (typeof c === 'string' ? sansAccent(c) : ''));
      const reconnus = Object.values(ENTETES).filter((mots) => textes.some((t) => mots.some((m) => t.includes(m)))).length;
      if (reconnus >= 2) { iEntete = i; break; }
    }
    const largeur = Math.max(...brut.map((r) => r.length));
    this.entetes = Array.from({ length: largeur }, (_, j) => {
      const v = brut[iEntete][j];
      return v != null && String(v).trim() ? String(v).trim() : `Colonne ${String.fromCharCode(65 + (j % 26))}`;
    });
    this.donnees = brut.slice(iEntete + 1);
    const norm = this.entetes.map(sansAccent);
    const pris = new Set<number>();
    for (const c of this.champs) {
      const j = norm.findIndex((t, k) => !pris.has(k) && ENTETES[c.cle].some((m) => t.includes(m)));
      this.correspondance[c.cle] = j;
      if (j >= 0) pris.add(j);
    }
    this.convertir();
  }

  convertir(): void {
    const col = (r: unknown[], c: Champ) => (this.correspondance[c] >= 0 ? r[this.correspondance[c]] : null);
    const vus = new Set<string>();
    this.lignes = this.donnees
      .map((r) => {
        const date = this.lireDate(col(r, 'date'));
        const montant = this.lireMontant(col(r, 'montant'));
        const description = col(r, 'description') != null ? String(col(r, 'description')).trim() : '';
        const texteCategorie = col(r, 'categorie') != null ? String(col(r, 'categorie')) : '';
        const texteBien = col(r, 'bien') != null ? String(col(r, 'bien')) : '';
        const l: Ligne = {
          inclus: true, date, montant, description,
          bien_id: this.trouverBien(texteBien || description) ?? this.bienDefaut,
          categorie: this.trouverCategorie(texteCategorie, description),
          doublon: false, probleme: '',
        };
        return l;
      })
      .filter((l) => l.date !== null || l.montant !== null || l.description);
    for (const l of this.lignes) {
      this.verifier(l, vus);
    }
  }

  verifier(l: Ligne, vus?: Set<string>): void {
    l.probleme = l.date === null ? 'Date invalide' : l.montant === null ? 'Montant invalide' : l.bien_id === null ? 'Bien à choisir' : '';
    const cle = `${l.bien_id}|${l.date}|${l.montant?.toFixed(2)}`;
    l.doublon = !l.probleme && (this.charges.some((c) => c.bien_id === l.bien_id && c.date === l.date && Number(c.montant).toFixed(2) === l.montant!.toFixed(2)) || (vus?.has(cle) ?? false));
    if (vus && !l.probleme) vus.add(cle);
    l.inclus = !l.probleme && !l.doublon;
  }

  aImporter(): Ligne[] { return this.lignes.filter((l) => l.inclus && !l.probleme); }
  totalAImporter(): number { return this.aImporter().reduce((s, l) => s + (l.montant ?? 0), 0); }
  nbDoublons(): number { return this.lignes.filter((l) => l.doublon).length; }
  nbProblemes(): number { return this.lignes.filter((l) => l.probleme).length; }
  toutCoche(): boolean { const ok = this.lignes.filter((l) => !l.probleme); return ok.length > 0 && ok.every((l) => l.inclus); }
  toutCocher(v: boolean): void { for (const l of this.lignes) if (!l.probleme) l.inclus = v; }
  fr(d: string | null): string { return d ? dateFr(d) : '—'; }
  court(nom: string): string { return nom.split('–')[0].trim(); }

  importer(): void {
    const depenses = this.aImporter().map((l) => ({
      bien_id: l.bien_id, categorie: l.categorie, description: l.description, montant: Math.round(l.montant! * 100) / 100, date: l.date,
    }));
    this.envoi = true;
    this.erreur = '';
    this.api.importerDepenses(depenses).subscribe({
      next: (r) => { this.envoi = false; this.termine.emit(r.importees); },
      error: (e) => { this.envoi = false; this.erreur = messageErreur(e); },
    });
  }

  async telechargerModele(): Promise<void> {
    const XLSX = await this.xlsx();
    const exemple = (i: number) => this.biens[i % Math.max(1, this.biens.length)]?.nom.split('–')[0].trim() ?? 'Nom du bien';
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Date', 'Bien', 'Catégorie', 'Description', 'Montant'],
      [new Date(), exemple(0), 'Charges communes', 'Appel de fonds syndic T4', 367.88],
      [new Date(), exemple(1), 'Travaux', 'Plombier – remplacement chauffe-eau', 890],
      [new Date(), exemple(2), 'Assurance', 'Assurance PNO annuelle', 133.74],
    ], { cellDates: true });
    feuille['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 40 }, { wch: 10 }];
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Dépenses');
    XLSX.writeFile(classeur, 'modele-depenses-immogest.xlsx');
  }

  // ---------- lecture des cellules ----------
  private lireDate(v: unknown): string | null {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (v instanceof Date && !isNaN(v.getTime())) return iso(new Date(v.getTime() + 12 * 3600000)); // évite les décalages de fuseau
    if (typeof v === 'number' && v > 20000 && v < 80000) return iso(new Date(Math.round((v - 25569) * 86400000) + 12 * 3600000));
    if (typeof v === 'string') {
      const s = v.trim();
      let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
      if (m) {
        const an = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        const d = new Date(an, Number(m[2]) - 1, Number(m[1]));
        return d.getMonth() === Number(m[2]) - 1 ? iso(d) : null;
      }
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return null;
  }

  private lireMontant(v: unknown): number | null {
    if (typeof v === 'number' && isFinite(v)) return Math.abs(v); // un relevé bancaire note souvent les débits en négatif
    if (typeof v === 'string') {
      const s = v.replace(/[€\s\u00a0\u202f]/g, '').replace(/EUR/i, '');
      if (!s) return null;
      const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
      return isFinite(n) ? Math.abs(n) : null;
    }
    return null;
  }

  private trouverBien(texte: string): number | null {
    const t = sansAccent(texte);
    if (!t) return null;
    // Mots propres à un seul bien (on ignore la ville commune à plusieurs biens, « rue », etc.)
    const mots = new Map<number, string[]>();
    const compte = new Map<string, number>();
    for (const b of this.biens) {
      const m = [...new Set(sansAccent(`${b.nom} ${b.adresse}`).split(/[^a-z0-9]+/).filter((x) => x.length >= 4 || /^\d+[a-z]?$/.test(x)))];
      mots.set(b.id, m);
      m.forEach((x) => compte.set(x, (compte.get(x) ?? 0) + 1));
    }
    let meilleur: number | null = null;
    let score = 0;
    for (const b of this.biens) {
      const s = mots.get(b.id)!.filter((x) => compte.get(x) === 1 && x.length >= 4 && t.includes(x)).length;
      if (s > score) { score = s; meilleur = b.id; }
    }
    return meilleur;
  }

  private trouverCategorie(texteCategorie: string, description: string): string {
    const c = sansAccent(texteCategorie);
    const exacte = this.categories.find((x) => sansAccent(x) === c);
    if (exacte) return exacte;
    const t = `${c} ${sansAccent(description)}`;
    for (const [cat, mots] of MOTS_CATEGORIE) if (mots.some((m) => t.includes(m))) return cat;
    return 'Autre';
  }
}
