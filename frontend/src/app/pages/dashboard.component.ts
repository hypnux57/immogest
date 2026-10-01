import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Dashboard, RegistreCell } from '../core/models';
import { EurPipe, dateFr, messageErreur, moisLabel } from '../core/format';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [EurPipe, RouterLink],
  styles: [`
    .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--line); margin-bottom: 3.5rem; }
    .figure { padding: 1.6rem 1.25rem 1.5rem 0; }
    .figure .label { color: var(--muted); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
    .figure .value { font-family: var(--display); font-weight: 300; font-size: 2.1rem; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; margin-top: 0.5rem; }
    .figure .hint { color: var(--muted); font-size: 0.8rem; }
    .value.neg { color: var(--late); }
    .registre { margin-bottom: 3.5rem; }
    .reg-scroll { overflow-x: auto; padding: 0.25rem 0 0; }
    table.reg { border-collapse: separate; border-spacing: 4px; }
    table.reg th { font-weight: 600; color: var(--muted); font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; text-align: center; white-space: nowrap; padding-bottom: 0.4rem; }
    table.reg th[scope=row] { text-align: left; color: var(--ink); font-size: 0.68rem; padding: 0 1.4rem 0 0; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
    table.reg th.now { color: var(--ink); text-decoration: underline; text-underline-offset: 4px; }
    .cell { display: block; width: 34px; height: 34px; background: var(--empty); }
    .cell.paye { background: var(--paid); }
    .cell.attente { background: transparent; border: 1px solid var(--ink); }
    .cell.retard { background: var(--late); }
    .legend { display: flex; gap: 1.75rem; flex-wrap: wrap; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-top: 1rem; }
    .legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
    .legend .cell { width: 10px; height: 10px; }
    .bars { display: flex; align-items: flex-end; gap: 6px; height: 160px; padding: 0 0.25rem; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; min-width: 22px; }
    .bar-pair { display: flex; gap: 2px; align-items: flex-end; height: 100%; width: 100%; justify-content: center; }
    .bar { width: 45%; max-width: 14px; min-height: 1px; }
    .bar.rev { background: var(--ink); } .bar.chg { background: #BDBDBD; }
    .bar-label { font-size: 0.55rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
    .two { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 1.5rem; }
    @media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
    ul.plain { list-style: none; padding: 0; margin: 0; }
    ul.plain li { padding: 0.5rem 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 1rem; }
    ul.plain li:last-child { border-bottom: 0; }
  `],
  template: `
    <header class="page-head">
      <div>
        <h1>Vue d'ensemble</h1>
        @if (d) { <p class="sub">{{ label(d.mois_courant) }}, {{ d.biens_loues }} biens loués sur {{ d.biens_total }}</p> }
      </div>
      <a class="btn" routerLink="/loyers">Encaisser les loyers</a>
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
    @if (!d && !erreur) { <p class="loading">Chargement des données…</p> }

    @if (d) {
      <section class="figures reveal" aria-label="Chiffres du mois">
        <div class="figure"><div class="label">Loyers attendus par mois</div><div class="value">{{ d.loyers_attendus | eur }}</div></div>
        <div class="figure"><div class="label">Encaissé ce mois</div><div class="value pos">{{ d.encaisse_mois | eur }}</div></div>
        <div class="figure"><div class="label">Reste à encaisser</div><div class="value" [class.warn]="d.attente_mois > 0">{{ d.attente_mois | eur }}</div></div>
        <div class="figure">
          <div class="label">Cash-flow mensuel estimé</div>
          <div class="value" [class.pos]="d.cashflow_mensuel >= 0" [class.neg]="d.cashflow_mensuel < 0">{{ d.cashflow_mensuel | eur }}</div>
          <div class="hint">après {{ d.credits_mensuels | eur }} de crédits et {{ d.charges_fixes_mensuelles | eur }} de charges</div>
        </div>
      </section>

      <section class="registre">
        <h2>Registre des loyers sur 12 mois</h2>
        <div class="reg-scroll">
          <table class="reg">
            <thead>
              <tr>
                <th></th>
                @for (m of d.mois; track m) { <th [class.now]="m === d.mois_courant">{{ court(m) }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (r of d.registre; track r.bien_id) {
                <tr>
                  <th scope="row" [title]="r.nom">{{ r.nom }}</th>
                  @for (c of r.cells; track c.mois) {
                    <td><span [class]="'cell ' + c.statut" [title]="titre(r.nom, c)" role="img" [attr.aria-label]="titre(r.nom, c)"></span></td>
                  }
                </tr>
              }
            </tbody>
          </table>
          <div class="legend">
            <span><i class="cell paye"></i>Payé</span>
            <span><i class="cell attente"></i>En attente</span>
            <span><i class="cell retard"></i>En retard</span>
            <span><i class="cell vide"></i>Aucune échéance</span>
          </div>
        </div>
      </section>

      <div class="two">
        <section class="panel">
          <h2>Loyers encaissés et dépenses</h2>
          <div class="bars" role="img" aria-label="Histogramme des loyers encaissés et des dépenses par mois">
            @for (m of d.mois; track m; let i = $index) {
              <div class="bar-col">
                <div class="bar-pair">
                  <div class="bar rev" [style.height.%]="pct(d.revenus_mois[i])" [title]="'Loyers ' + court(m) + ' : ' + (d.revenus_mois[i] | eur)"></div>
                  <div class="bar chg" [style.height.%]="pct(d.charges_mois[i])" [title]="'Dépenses ' + court(m) + ' : ' + (d.charges_mois[i] | eur)"></div>
                </div>
                <span class="bar-label">{{ court(m) }}</span>
              </div>
            }
          </div>
          <div class="legend"><span><i class="cell paye"></i>Loyers encaissés</span><span><i class="cell" style="background:#BDBDBD"></i>Dépenses</span></div>
        </section>

        <section class="panel">
          <h2>Baux à échéance</h2>
          @if (d.baux_a_echeance.length === 0) {
            <p class="secondary">Aucun bail ne se termine dans les 90 prochains jours.</p>
          } @else {
            <ul class="plain">
              @for (b of d.baux_a_echeance; track b.locataire_id) {
                <li><span>{{ b.nom }}</span><span class="badge warn">{{ fr(b.fin) }}</span></li>
              }
            </ul>
          }
        </section>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  d: Dashboard | null = null;
  erreur = '';
  private max = 1;

  ngOnInit(): void {
    this.api.dashboard().subscribe({
      next: (d) => {
        this.d = d;
        this.max = Math.max(1, ...d.revenus_mois, ...d.charges_mois);
      },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  label(m: string): string { return moisLabel(m); }
  court(m: string): string { return moisLabel(m, true); }
  fr(iso: string): string { return dateFr(iso); }
  pct(v: number): number { return Math.round((v / this.max) * 100); }

  titre(nom: string, c: RegistreCell): string {
    const libelles = { paye: 'payé', attente: 'en attente', retard: 'en retard', vide: 'aucune échéance' };
    const montant = c.montant ? ` (${Math.round(c.montant)} €)` : '';
    return `${nom}, ${moisLabel(c.mois)} : ${libelles[c.statut]}${montant}`;
  }
}
