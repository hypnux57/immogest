import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Bien, Charge } from '../core/models';
import { EurPipe, messageErreur } from '../core/format';

interface Ligne {
  bien: Bien;
  inclus: boolean;
  prix: number;
  loyersAn: number;
  chargesAn: number;
  travaux12m: number;
  creditAn: number;
  brut: number | null;
  net: number | null;
  cashflowMois: number;
  plusValue: number;
}

const PCT = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

@Component({
  selector: 'app-rentabilite',
  standalone: true,
  imports: [FormsModule, EurPipe],
  styles: [`
    .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--line); margin-bottom: 3rem; }
    .figure { padding: 1.6rem 1.25rem 1.5rem 0; }
    .figure .label { color: var(--muted); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
    .figure .value { font-weight: 300; font-size: 2.1rem; font-variant-numeric: tabular-nums; margin-top: 0.5rem; }
    .figure .hint { color: var(--muted); font-size: 0.8rem; }
    .neg { color: var(--late); }
    .options { display: flex; gap: 2rem; flex-wrap: wrap; margin-bottom: 1.25rem; font-size: 0.85rem; }
    .options label { display: inline-flex; gap: 0.5rem; align-items: center; cursor: pointer; }
    input[type=checkbox] { accent-color: #000; width: 15px; height: 15px; }
    tr.exclu td { color: var(--muted); }
    tr.total td { border-top: 1px solid var(--ink); font-weight: 600; }
    .compare { display: grid; gap: 1.1rem; margin: 3rem 0; }
    .compare .row { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 1.25rem; align-items: center; }
    .compare .name { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .compare .bars { display: grid; gap: 4px; }
    .compare .bar { height: 12px; position: relative; }
    .compare .bar span { display: block; height: 100%; position: relative; }
    .compare .bar.brut span { border: 1px solid var(--ink); background: transparent; }
    .compare .bar.net span { background: var(--ink); }
    .compare .bar.net.neg span { background: var(--late); }
    .compare .val { position: absolute; left: calc(100% + 0.5rem); top: -3px; font-size: 0.72rem; font-style: normal; white-space: nowrap; color: var(--ink); }
    .legend { display: flex; gap: 1.75rem; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
    .legend i { display: inline-block; width: 18px; height: 10px; margin-right: 0.5rem; vertical-align: -1px; }
    .methode { color: var(--muted); font-size: 0.85rem; max-width: 70ch; display: grid; gap: 0.5rem; }
    @media (max-width: 640px) { .compare .row { grid-template-columns: 1fr; gap: 0.4rem; } }
  `],
  template: `
    <header class="page-head">
      <div><h1>Rentabilité</h1><p class="sub">Rendements calculés sur le coût d'acquisition, avant impôts</p></div>
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
    @if (!charge && !erreur) { <p class="loading">Calcul en cours…</p> }

    @if (charge) {
      @if (manquants().length) {
        <div class="panel" role="status">
          Coût d'acquisition manquant pour : {{ manquants().join(', ') }}. Renseignez-le dans l'onglet Biens pour calculer ses rendements.
        </div>
      }

      <section class="figures reveal" aria-label="Synthèse du portefeuille">
        <div class="figure"><div class="label">Rendement brut</div><div class="value">{{ pct(total.brut) }}</div><div class="hint">{{ total.loyersAn | eur }} de loyers par an</div></div>
        <div class="figure"><div class="label">Rendement net</div><div class="value" [class.neg]="(total.net ?? 0) < 0">{{ pct(total.net) }}</div><div class="hint">après {{ total.chargesAn + (avecTravaux ? total.travaux12m : 0) | eur }} de frais par an</div></div>
        <div class="figure"><div class="label">Cash-flow mensuel</div><div class="value" [class.neg]="total.cashflowMois < 0">{{ total.cashflowMois | eur }}</div><div class="hint">après {{ total.creditAn / 12 | eur }} de crédits</div></div>
        <div class="figure"><div class="label">Plus-value latente</div><div class="value" [class.neg]="total.plusValue < 0">{{ total.plusValue | eur }}</div><div class="hint">sur {{ total.prix | eur }} investis</div></div>
      </section>

      <div class="options">
        <label><input type="checkbox" [(ngModel)]="avecTravaux" (ngModelChange)="calculer()"> Déduire les travaux des 12 derniers mois</label>
      </div>

      <div class="table-wrap">
        <table class="list">
          <thead><tr>
            <th>Inclus</th><th>Bien</th><th class="num">Coût</th><th class="num">Loyers / an</th><th class="num">Frais / an</th>
            <th class="num">Brut</th><th class="num">Net</th><th class="num">Cash-flow / mois</th><th class="num">Plus-value</th>
          </tr></thead>
          <tbody>
            @for (l of lignes; track l.bien.id) {
              <tr [class.exclu]="!l.inclus">
                <td><input type="checkbox" [(ngModel)]="l.inclus" (ngModelChange)="totaliser()" [attr.aria-label]="'Inclure ' + l.bien.nom"></td>
                <td><div>{{ l.bien.nom }}</div><div class="secondary">{{ l.bien.annee_achat ? 'Acheté en ' + l.bien.annee_achat : 'Année d’achat inconnue' }}</div></td>
                <td class="num">{{ l.prix ? (l.prix | eur) : '—' }}</td>
                <td class="num">{{ l.loyersAn | eur }}</td>
                <td class="num">{{ l.chargesAn + (avecTravaux ? l.travaux12m : 0) | eur }}</td>
                <td class="num">{{ pct(l.brut) }}</td>
                <td class="num" [class.neg]="(l.net ?? 0) < 0">{{ pct(l.net) }}</td>
                <td class="num" [class.neg]="l.cashflowMois < 0">{{ l.cashflowMois | eur }}</td>
                <td class="num" [class.neg]="l.plusValue < 0">{{ l.prix ? (l.plusValue | eur) : '—' }}</td>
              </tr>
            }
            <tr class="total">
              <td></td><td>Total des biens inclus</td>
              <td class="num">{{ total.prix | eur }}</td>
              <td class="num">{{ total.loyersAn | eur }}</td>
              <td class="num">{{ total.chargesAn + (avecTravaux ? total.travaux12m : 0) | eur }}</td>
              <td class="num">{{ pct(total.brut) }}</td>
              <td class="num" [class.neg]="(total.net ?? 0) < 0">{{ pct(total.net) }}</td>
              <td class="num" [class.neg]="total.cashflowMois < 0">{{ total.cashflowMois | eur }}</td>
              <td class="num" [class.neg]="total.plusValue < 0">{{ total.plusValue | eur }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="compare" aria-label="Comparaison des rendements par bien">
        <h2>Brut et net par bien</h2>
        @for (l of lignesAvecPrix(); track l.bien.id) {
          <div class="row">
            <span class="name" [title]="l.bien.nom">{{ l.bien.nom }}</span>
            <div class="bars">
              <div class="bar brut"><span [style.width.%]="largeur(l.brut)"><em class="val">{{ pct(l.brut) }}</em></span></div>
              <div class="bar net" [class.neg]="(l.net ?? 0) < 0"><span [style.width.%]="largeur(l.net)"><em class="val">{{ pct(l.net) }}</em></span></div>
            </div>
          </div>
        }
        <div class="legend"><span><i style="border:1px solid #000"></i>Brut</span><span><i style="background:#000"></i>Net</span></div>
      </section>

      <section class="methode">
        <h2>Méthode</h2>
        <p><strong>Rendement brut</strong> = loyers annuels ÷ coût d'acquisition (prix, frais de notaire et travaux initiaux si vous les y incluez).</p>
        <p><strong>Rendement net</strong> = (loyers annuels − charges de copropriété − taxe foncière − assurance PNO{{ avecTravaux ? ' − travaux des 12 derniers mois' : '' }}) ÷ coût d'acquisition. Il est calculé avant impôt sur le revenu et prélèvements sociaux, et sans tenir compte du crédit.</p>
        <p><strong>Cash-flow mensuel</strong> = ce qui reste chaque mois après le crédit, les charges, la taxe foncière et l'assurance.</p>
        <p>Les loyers retenus sont ceux saisis sur chaque bien. Décochez un bien pour l'exclure des totaux, par exemple une résidence principale partagée.</p>
      </section>
    }
  `,
})
export class RentabiliteComponent implements OnInit {
  private api = inject(ApiService);
  biens: Bien[] = [];
  charges: Charge[] = [];
  lignes: Ligne[] = [];
  avecTravaux = false;
  charge = false;
  erreur = '';
  total = { prix: 0, loyersAn: 0, chargesAn: 0, travaux12m: 0, creditAn: 0, brut: null as number | null, net: null as number | null, cashflowMois: 0, plusValue: 0 };
  private maxPct = 0.1;

  ngOnInit(): void {
    forkJoin({ b: this.api.list<Bien>('biens'), c: this.api.list<Charge>('charges') }).subscribe({
      next: ({ b, c }) => {
        this.biens = b;
        this.charges = c;
        // Une résidence en colocation (part du propriétaire occupant) est exclue par défaut des totaux
        this.lignes = b.map((bien) => ({ bien, inclus: !/colocation/i.test(bien.notes || '') } as Ligne));
        this.calculer();
        this.charge = true;
      },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  calculer(): void {
    const depuis = new Date();
    depuis.setFullYear(depuis.getFullYear() - 1);
    const limite = depuis.toISOString().slice(0, 10);
    for (const l of this.lignes) {
      const b = l.bien;
      l.prix = Number(b.prix_achat) || 0;
      l.loyersAn = Number(b.loyer) * 12;
      l.chargesAn = Number(b.charges_mens) * 12 + Number(b.taxe_fonciere) + Number(b.assurance_pno);
      l.travaux12m = this.charges
        .filter((c) => c.bien_id === b.id && c.categorie === 'Travaux' && c.date >= limite)
        .reduce((s, c) => s + Number(c.montant), 0);
      l.creditAn = Number(b.credit_mens) * 12;
      const frais = l.chargesAn + (this.avecTravaux ? l.travaux12m : 0);
      l.brut = l.prix ? l.loyersAn / l.prix : null;
      l.net = l.prix ? (l.loyersAn - frais) / l.prix : null;
      l.cashflowMois = Math.round(((l.loyersAn - frais - l.creditAn) / 12) * 100) / 100;
      l.plusValue = l.prix ? (Number(b.valeur_actuelle) || l.prix) - l.prix : 0;
    }
    this.maxPct = Math.max(0.01, ...this.lignes.map((l) => Math.max(l.brut ?? 0, l.net ?? 0)));
    this.totaliser();
  }

  totaliser(): void {
    const inc = this.lignes.filter((l) => l.inclus);
    const somme = (f: (l: Ligne) => number) => inc.reduce((s, l) => s + f(l), 0);
    const avecPrix = inc.filter((l) => l.prix);
    const prix = avecPrix.reduce((s, l) => s + l.prix, 0);
    const loyersPrix = avecPrix.reduce((s, l) => s + l.loyersAn, 0);
    const fraisPrix = avecPrix.reduce((s, l) => s + l.chargesAn + (this.avecTravaux ? l.travaux12m : 0), 0);
    this.total = {
      prix,
      loyersAn: somme((l) => l.loyersAn),
      chargesAn: somme((l) => l.chargesAn),
      travaux12m: somme((l) => l.travaux12m),
      creditAn: somme((l) => l.creditAn),
      brut: prix ? loyersPrix / prix : null,
      net: prix ? (loyersPrix - fraisPrix) / prix : null,
      cashflowMois: Math.round(somme((l) => l.cashflowMois) * 100) / 100,
      plusValue: somme((l) => l.plusValue),
    };
  }

  manquants(): string[] { return this.lignes.filter((l) => !l.prix).map((l) => l.bien.nom); }
  lignesAvecPrix(): Ligne[] { return this.lignes.filter((l) => l.prix); }
  pct(v: number | null): string { return v === null ? '—' : PCT.format(v); }
  largeur(v: number | null): number { return v === null ? 0 : Math.max(0, Math.min(100, (v / this.maxPct) * 85)); }
}
