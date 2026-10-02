import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Bien, Charge, Locataire } from '../core/models';
import { EurPipe, messageErreur } from '../core/format';

/** Une colonne de la déclaration : un bien, ou le total. */
interface Colonne {
  bien: Bien | null;
  inclus: boolean;
  l211: number; // loyers bruts encaissés
  l221: number; // frais de gestion (forfait 20 € + gestion locative)
  l223: number; // primes d'assurance
  l224: number; // réparation, entretien, amélioration
  l227: number; // taxe foncière
  l229: number; // provisions pour charges de copropriété
  l240: number; // total des frais et charges
  l250: number; // intérêts d'emprunt
  l261: number; // résultat
}

interface Parametres { annee: number; tmi: number; ps: number; deficitAnterieur: number; exclus: number[]; }

const CLE = 'immogest_fiscalite';
const PLAFOND_DEFICIT = 10700;
const CATEGORIES_TRAVAUX = ['Travaux', 'Entretien', 'Équipement'];

@Component({
  selector: 'app-fiscalite',
  standalone: true,
  imports: [FormsModule, EurPipe],
  styles: [`
    .params { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1.4rem 1.6rem; margin-bottom: 3rem; }
    .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--line); margin-bottom: 3rem; }
    .figure { padding: 1.6rem 1.25rem 1.5rem 0; }
    .figure .label { color: var(--muted); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
    .figure .value { font-weight: 300; font-size: 2.1rem; font-variant-numeric: tabular-nums; margin-top: 0.5rem; }
    .figure .hint { color: var(--muted); font-size: 0.8rem; }
    .gain { color: var(--ink); }
    table.decl td.code { color: var(--muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; width: 3rem; }
    table.decl tr.sous-total td { border-top: 1px solid var(--ink); font-weight: 600; }
    table.decl th.bien { max-width: 140px; white-space: normal; text-align: right; }
    table.decl td.exclu, table.decl th.exclu { color: var(--muted); opacity: 0.45; }
    input[type=checkbox] { accent-color: #000; width: 15px; height: 15px; vertical-align: -2px; margin-right: 0.35rem; }
    .cases { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; border-top: 1px solid var(--ink); margin: 1rem 0 3rem; }
    .case { padding: 1rem 1rem 1rem 0; border-bottom: 1px solid var(--line); }
    .case .code { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; color: var(--muted); }
    .case .montant { font-size: 1.35rem; font-weight: 300; margin-top: 0.25rem; font-variant-numeric: tabular-nums; }
    .case .quoi { font-size: 0.78rem; color: var(--muted); }
    .methode { color: var(--muted); font-size: 0.85rem; max-width: 72ch; display: grid; gap: 0.5rem; }
  `],
  template: `
    <header class="page-head">
      <div><h1>Impôts</h1><p class="sub">Estimation des revenus fonciers au régime réel, comme sur la déclaration 2044</p></div>
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
    @if (!charge && !erreur) { <p class="loading">Calcul en cours…</p> }

    @if (charge) {
      <section class="params" aria-label="Paramètres">
        <div class="field"><label for="f-annee">Année des revenus</label>
          <select id="f-annee" [(ngModel)]="p.annee" (ngModelChange)="calculer()">
            @for (a of annees; track a) { <option [ngValue]="a">{{ a }} (déclarés en {{ a + 1 }})</option> }
          </select>
        </div>
        <div class="field"><label for="f-tmi">Tranche marginale d'imposition</label>
          <select id="f-tmi" [(ngModel)]="p.tmi" (ngModelChange)="calculer()">
            @for (t of tranches; track t) { <option [ngValue]="t">{{ t }} %</option> }
          </select>
        </div>
        <div class="field"><label for="f-ps">Prélèvements sociaux (%)</label>
          <input id="f-ps" type="number" min="0" max="30" step="0.1" [(ngModel)]="p.ps" (ngModelChange)="calculer()">
        </div>
        <div class="field"><label for="f-def">Déficits fonciers antérieurs reportables (€)</label>
          <input id="f-def" type="number" min="0" step="1" [(ngModel)]="p.deficitAnterieur" (ngModelChange)="calculer()">
        </div>
      </section>

      <section class="figures reveal" aria-label="Résultat">
        <div class="figure">
          <div class="label">Revenu foncier net</div>
          <div class="value">{{ total.l261 | eur }}</div>
          <div class="hint">{{ total.l261 >= 0 ? 'bénéfice' : 'déficit' }} pour {{ p.annee }}</div>
        </div>
        @if (resultat.imposable > 0 || total.l261 >= 0) {
          <div class="figure"><div class="label">Impôt sur le revenu</div><div class="value">{{ resultat.ir | eur }}</div><div class="hint">{{ resultat.imposable | eur }} × {{ p.tmi }} %</div></div>
          <div class="figure"><div class="label">Prélèvements sociaux</div><div class="value">{{ resultat.ps | eur }}</div><div class="hint">{{ resultat.imposable | eur }} × {{ p.ps }} %</div></div>
          <div class="figure"><div class="label">Total à payer</div><div class="value">{{ resultat.ir + resultat.ps | eur }}</div><div class="hint">soit {{ (resultat.ir + resultat.ps) / 12 | eur }} par mois</div></div>
        } @else {
          <div class="figure"><div class="label">Économie d'impôt</div><div class="value gain">{{ resultat.economie | eur }}</div><div class="hint">{{ cases.c4BC | eur }} imputés sur le revenu global × {{ p.tmi }} %</div></div>
          <div class="figure"><div class="label">Déficit à reporter</div><div class="value">{{ cases.c4BB | eur }}</div><div class="hint">sur les revenus fonciers des 10 années suivantes</div></div>
          <div class="figure"><div class="label">Prélèvements sociaux</div><div class="value">0 €</div><div class="hint">aucun en cas de déficit</div></div>
        }
      </section>

      @if (chevauchements.length) {
        <div class="error" role="alert">
          Des baux se chevauchent en {{ p.annee }} pour : {{ chevauchements.join(', ') }}. Les loyers de ce bien sont surestimés : corrigez les dates d'entrée et de sortie dans l'onglet Locataires.
        </div>
      }

      <h2>Déclaration 2044 simplifiée</h2>
      <div class="table-wrap">
        <table class="list decl">
          <thead><tr>
            <th></th><th>Ligne</th>
            @for (c of colonnes; track c.bien!.id) {
              <th class="num bien" [class.exclu]="!c.inclus">
                <label><input type="checkbox" [(ngModel)]="c.inclus" (ngModelChange)="basculer(c)" [attr.aria-label]="'Inclure ' + c.bien!.nom">{{ court(c.bien!.nom) }}</label>
              </th>
            }
            <th class="num">Total</th>
          </tr></thead>
          <tbody>
            @for (r of lignes; track r.code) {
              <tr [class.sous-total]="r.fort">
                <td class="code">{{ r.code }}</td>
                <td>{{ r.libelle }}</td>
                @for (c of colonnes; track c.bien!.id) { <td class="num" [class.exclu]="!c.inclus">{{ c[r.cle] | eur }}</td> }
                <td class="num">{{ total[r.cle] | eur }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <h2 style="margin-top:3rem">À reporter sur la déclaration 2042</h2>
      <div class="cases">
        <div class="case"><div class="code">CASE 4BA</div><div class="montant">{{ cases.c4BA | eur }}</div><div class="quoi">Revenu foncier imposable</div></div>
        <div class="case"><div class="code">CASE 4BB</div><div class="montant">{{ cases.c4BB | eur }}</div><div class="quoi">Déficit imputable sur les revenus fonciers</div></div>
        <div class="case"><div class="code">CASE 4BC</div><div class="montant">{{ cases.c4BC | eur }}</div><div class="quoi">Déficit imputable sur le revenu global</div></div>
        <div class="case"><div class="code">CASE 4BD</div><div class="montant">{{ p.deficitAnterieur | eur }}</div><div class="quoi">Déficits antérieurs non encore imputés</div></div>
      </div>

      <section class="methode">
        <h2>Comment c'est calculé</h2>
        <p><strong>Loyers (211)</strong> : reconstitués à partir des baux de l'onglet Locataires (montant mensuel et dates d'entrée et de sortie), au prorata des jours d'occupation sur l'année. Les loyers étant saisis charges comprises, les provisions de copropriété sont déduites en totalité (229) : le résultat est le même que loyers hors charges moins la seule part non récupérable.</p>
        <p><strong>Frais</strong> : forfait de gestion de 20 € par logement, assurance PNO, taxe foncière, provisions de copropriété, et dépenses de l'année classées Travaux, Entretien, Équipement ou Gestion locative dans l'onglet Dépenses. Pour un logement loué en partie, ces montants sont multipliés par la part louée (onglet Biens).</p>
        <p><strong>Intérêts (250)</strong> : montant annuel saisi pour chaque bien. Ajoutez-y l'assurance emprunteur, également déductible.</p>
        <p><strong>Déficit</strong> : la part due aux charges autres que les intérêts s'impute sur le revenu global dans la limite de 10 700 € ; le reste se reporte sur les revenus fonciers des dix années suivantes.</p>
        <p>Estimation indicative : je ne suis pas conseiller fiscal. Elle ne tient pas compte de la CSG déductible l'année suivante, des régimes particuliers (Pinel, Denormandie, déficit majoré pour rénovation énergétique) ni de l'exonération éventuelle d'une pièce louée dans votre résidence principale. Vérifiez le taux des prélèvements sociaux applicable à l'année concernée.</p>
      </section>
    }
  `,
})
export class FiscaliteComponent implements OnInit {
  private api = inject(ApiService);
  biens: Bien[] = [];
  locataires: Locataire[] = [];
  charges: Charge[] = [];
  colonnes: Colonne[] = [];
  total: Colonne = this.vide(null);
  cases = { c4BA: 0, c4BB: 0, c4BC: 0 };
  resultat = { imposable: 0, ir: 0, ps: 0, economie: 0 };
  charge = false;
  erreur = '';
  tranches = [0, 11, 30, 41, 45];
  annees: number[] = [];
  chevauchements: string[] = [];
  p: Parametres = this.lire();

  lignes: { code: string; libelle: string; cle: keyof Omit<Colonne, 'bien' | 'inclus'>; fort?: boolean }[] = [
    { code: '211', libelle: 'Loyers bruts encaissés', cle: 'l211', fort: true },
    { code: '221', libelle: 'Frais de gestion', cle: 'l221' },
    { code: '223', libelle: 'Assurance propriétaire non occupant', cle: 'l223' },
    { code: '224', libelle: 'Réparation, entretien, amélioration', cle: 'l224' },
    { code: '227', libelle: 'Taxe foncière', cle: 'l227' },
    { code: '229', libelle: 'Provisions pour charges de copropriété', cle: 'l229' },
    { code: '240', libelle: 'Total des frais et charges', cle: 'l240', fort: true },
    { code: '250', libelle: 'Intérêts d\u2019emprunt', cle: 'l250' },
    { code: '261', libelle: 'Revenu foncier net', cle: 'l261', fort: true },
  ];

  ngOnInit(): void {
    const an = new Date().getFullYear();
    this.annees = [an, an - 1];
    forkJoin({
      b: this.api.list<Bien>('biens'),
      l: this.api.list<Locataire>('locataires'),
      c: this.api.list<Charge>('charges'),
    }).subscribe({
      next: ({ b, l, c }) => {
        this.biens = b; this.locataires = l; this.charges = c;
        this.colonnes = b.map((bien) => ({ ...this.vide(bien), inclus: !this.p.exclus.includes(bien.id) }));
        this.calculer();
        this.charge = true;
      },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  basculer(c: Colonne): void {
    const id = c.bien!.id;
    this.p.exclus = c.inclus ? this.p.exclus.filter((x) => x !== id) : [...this.p.exclus, id];
    this.calculer();
  }

  calculer(): void {
    const debutAn = new Date(this.p.annee, 0, 1).getTime();
    const finAn = new Date(this.p.annee, 11, 31).getTime();
    const jour = 86400000;
    const joursAn = Math.round((finAn - debutAn) / jour) + 1;

    this.chevauchements = [];
    for (const c of this.colonnes) {
      const b = c.bien!;
      let joursOccupes = 0;
      const qp = Math.min(100, Math.max(0, Number(b.quote_part ?? 100))) / 100;
      // Loyers au prorata des jours de chaque bail sur l'année
      c.l211 = this.locataires
        .filter((l) => l.bien_id === b.id)
        .reduce((s, l) => {
          const d = Math.max(debutAn, l.debut ? new Date(l.debut).getTime() : debutAn);
          const f = Math.min(finAn, l.fin ? new Date(l.fin).getTime() : finAn);
          const jours = f >= d ? Math.round((f - d) / jour) + 1 : 0;
          joursOccupes += jours;
          return s + Number(l.loyer) * 12 * (jours / joursAn);
        }, 0);
      // Des baux qui se recouvrent (dates approximatives) gonfleraient les loyers
      if (joursOccupes > joursAn + 3) this.chevauchements.push(this.court(b.nom));
      const depensesAn = this.charges.filter((x) => x.bien_id === b.id && x.date.startsWith(String(this.p.annee)));
      const somme = (cats: string[]) => depensesAn.filter((x) => cats.includes(x.categorie)).reduce((s, x) => s + Number(x.montant), 0);
      c.l221 = 20 + somme(['Gestion locative']) * qp;
      c.l223 = Number(b.assurance_pno) * qp;
      c.l224 = somme(CATEGORIES_TRAVAUX) * qp;
      c.l227 = Number(b.taxe_fonciere) * qp;
      c.l229 = Number(b.charges_mens) * 12 * qp;
      c.l240 = c.l221 + c.l223 + c.l224 + c.l227 + c.l229;
      c.l250 = Number(b.interets_annuels) * qp;
      c.l261 = c.l211 - c.l240 - c.l250;
      for (const k of ['l211', 'l221', 'l223', 'l224', 'l227', 'l229', 'l240', 'l250', 'l261'] as const) c[k] = Math.round(c[k]);
    }

    const t = this.vide(null);
    for (const c of this.colonnes.filter((x) => x.inclus)) {
      for (const k of ['l211', 'l221', 'l223', 'l224', 'l227', 'l229', 'l240', 'l250', 'l261'] as const) t[k] += c[k];
    }
    this.total = t;

    // Répartition du résultat entre les cases de la 2042
    const horsInterets = t.l211 - t.l240;
    if (t.l261 >= 0) {
      this.cases = { c4BA: t.l261, c4BB: 0, c4BC: 0 };
    } else if (horsInterets >= 0) {
      this.cases = { c4BA: 0, c4BB: -t.l261, c4BC: 0 };
    } else {
      const surGlobal = Math.min(-horsInterets, PLAFOND_DEFICIT);
      this.cases = { c4BA: 0, c4BB: -horsInterets - surGlobal + t.l250, c4BC: surGlobal };
    }
    const imposable = Math.max(0, this.cases.c4BA - Number(this.p.deficitAnterieur || 0));
    this.resultat = {
      imposable,
      ir: Math.round(imposable * this.p.tmi / 100),
      ps: Math.round(imposable * Number(this.p.ps) / 100),
      economie: Math.round(this.cases.c4BC * this.p.tmi / 100),
    };
    this.ecrire();
  }

  court(nom: string): string { return nom.split('–')[0].trim(); }

  private vide(bien: Bien | null): Colonne {
    return { bien, inclus: true, l211: 0, l221: 0, l223: 0, l224: 0, l227: 0, l229: 0, l240: 0, l250: 0, l261: 0 };
  }

  private lire(): Parametres {
    const defaut: Parametres = { annee: new Date().getFullYear(), tmi: 30, ps: 17.2, deficitAnterieur: 0, exclus: [] };
    try {
      const brut = localStorage.getItem(CLE);
      return brut ? { ...defaut, ...JSON.parse(brut) } : defaut;
    } catch { return defaut; }
  }

  private ecrire(): void {
    try { localStorage.setItem(CLE, JSON.stringify(this.p)); } catch { /* stockage indisponible */ }
  }
}
