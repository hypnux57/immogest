import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Bien, Charge } from '../core/models';
import { EurPipe, dateFr, messageErreur } from '../core/format';
import { ImportDepensesComponent } from './import-depenses.component';

type ChargeForm = Omit<Charge, 'id'> & { id?: number };

@Component({
  selector: 'app-charges',
  standalone: true,
  imports: [FormsModule, EurPipe, ImportDepensesComponent],
  styles: [`
    .filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .filters select { width: auto; }
    .cats { display: grid; gap: 0.5rem; }
    .cat { display: grid; grid-template-columns: 150px minmax(0, 1fr) 100px; gap: 0.75rem; align-items: center; font-size: 0.9rem; }
    .cat .track { height: 10px; background: var(--empty); border-radius: 2px; overflow: hidden; }
    .cat .fill { height: 100%; background: var(--ink-soft); }
    .cat .amount { text-align: right; font-variant-numeric: tabular-nums; }
    @media (max-width: 560px) { .cat { grid-template-columns: 110px minmax(0, 1fr) 80px; } }
  `],
  template: `
    <header class="page-head">
      <div><h1>Dépenses</h1><p class="sub">{{ filtrees().length }} dépenses, {{ totalFiltre() | eur }} au total</p></div>
      @if (!form && !importOuvert) {
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn" type="button" (click)="importOuvert = true; info = ''" [disabled]="!biens.length">Importer un fichier Excel</button>
          <button class="btn primary" type="button" (click)="nouveau()" [disabled]="!biens.length">Ajouter une dépense</button>
        </div>
      }
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
    @if (info) { <div class="panel" role="status">{{ info }}</div> }
    @if (importOuvert) {
      <app-import-depenses [biens]="biens" [charges]="charges" [categories]="categories" (termine)="importFini($event)" (annuler)="importOuvert = false" />
    }

    @if (form) {
      <form class="panel reveal" (ngSubmit)="enregistrer()">
        <h2>{{ form.id ? 'Modifier la dépense' : 'Nouvelle dépense' }}</h2>
        <div class="form-grid">
          <div class="field"><label for="c-bien">Bien</label>
            <select id="c-bien" name="bien" [(ngModel)]="form.bien_id">
              @for (b of biens; track b.id) { <option [ngValue]="b.id">{{ b.nom }}</option> }
            </select>
          </div>
          <div class="field"><label for="c-cat">Catégorie</label>
            <select id="c-cat" name="cat" [(ngModel)]="form.categorie">
              @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </div>
          <div class="field"><label for="c-montant">Montant (€)</label><input id="c-montant" name="montant" type="number" min="0" step="0.01" [(ngModel)]="form.montant"></div>
          <div class="field"><label for="c-date">Date</label><input id="c-date" name="date" type="date" [(ngModel)]="form.date" required></div>
          <div class="field wide"><label for="c-desc">Description</label><input id="c-desc" name="desc" [(ngModel)]="form.description"></div>
        </div>
        <div class="form-actions">
          <button class="btn" type="button" (click)="form = null">Annuler</button>
          <button class="btn primary" type="submit" [disabled]="!form.date">Enregistrer la dépense</button>
        </div>
      </form>
    }

    <div class="filters">
      <select class="inline-input" [(ngModel)]="filtreBien" aria-label="Filtrer par bien">
        <option [ngValue]="0">Tous les biens</option>
        @for (b of biens; track b.id) { <option [ngValue]="b.id">{{ b.nom }}</option> }
      </select>
      <select class="inline-input" [(ngModel)]="filtreAnnee" aria-label="Filtrer par année">
        <option value="">Toutes les années</option>
        @for (a of annees(); track a) { <option [value]="a">{{ a }}</option> }
      </select>
    </div>

    @if (filtrees().length) {
      <section class="panel">
        <h2>Par catégorie</h2>
        <div class="cats">
          @for (c of parCategorie(); track c.nom) {
            <div class="cat">
              <span>{{ c.nom }}</span>
              <div class="track"><div class="fill" [style.width.%]="c.pct"></div></div>
              <span class="amount">{{ c.total | eur }}</span>
            </div>
          }
        </div>
      </section>

      <div class="table-wrap">
        <table class="list">
          <thead><tr><th>Date</th><th>Bien</th><th>Catégorie</th><th>Description</th><th class="num">Montant</th><th></th></tr></thead>
          <tbody>
            @for (c of filtrees(); track c.id) {
              <tr>
                <td>{{ fr(c.date) }}</td>
                <td>{{ nomBien(c.bien_id) }}</td>
                <td><span class="badge neutre">{{ c.categorie }}</span></td>
                <td class="secondary">{{ c.description || '—' }}</td>
                <td class="num">{{ c.montant | eur }}</td>
                <td><div class="actions">
                  <button class="btn small" type="button" (click)="modifier(c)">Modifier</button>
                  <button class="btn small danger" type="button" (click)="supprimer(c)">Supprimer</button>
                </div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (charge) {
      <div class="panel empty-state">Aucune dépense pour ce filtre.</div>
    }
  `,
})
export class ChargesComponent implements OnInit {
  private api = inject(ApiService);
  biens: Bien[] = [];
  charges: Charge[] = [];
  form: ChargeForm | null = null;
  erreur = '';
  charge = false;
  filtreBien = 0;
  filtreAnnee = '';
  importOuvert = false;
  info = '';
  categories = ['Travaux', 'Charges communes', 'Taxe foncière', 'Assurance', 'Gestion locative', 'Entretien', 'Équipement', 'Autre'];

  ngOnInit(): void { this.charger(); }

  charger(): void {
    forkJoin({ b: this.api.list<Bien>('biens'), c: this.api.list<Charge>('charges') }).subscribe({
      next: ({ b, c }) => { this.biens = b; this.charges = c; this.charge = true; },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  nomBien(id: number): string { return this.biens.find((b) => b.id === id)?.nom ?? '—'; }
  fr(iso: string): string { return dateFr(iso); }
  annees(): string[] { return [...new Set(this.charges.map((c) => c.date.slice(0, 4)))].sort().reverse(); }

  filtrees(): Charge[] {
    return this.charges.filter((c) =>
      (!this.filtreBien || c.bien_id === this.filtreBien) && (!this.filtreAnnee || c.date.startsWith(this.filtreAnnee)));
  }

  totalFiltre(): number { return this.filtrees().reduce((s, c) => s + Number(c.montant), 0); }

  parCategorie(): { nom: string; total: number; pct: number }[] {
    const map = new Map<string, number>();
    for (const c of this.filtrees()) map.set(c.categorie, (map.get(c.categorie) ?? 0) + Number(c.montant));
    const max = Math.max(1, ...map.values());
    return [...map.entries()]
      .map(([nom, total]) => ({ nom, total: Math.round(total * 100) / 100, pct: Math.round((total / max) * 100) }))
      .sort((a, b) => b.total - a.total);
  }

  importFini(n: number): void {
    this.importOuvert = false;
    this.info = `${n} dépense(s) importée(s).`;
    this.charger();
  }

  nouveau(): void {
    this.erreur = '';
    this.form = {
      bien_id: this.filtreBien || this.biens[0].id, categorie: 'Travaux', description: '', montant: 0,
      date: new Date().toISOString().slice(0, 10),
    };
  }

  modifier(c: Charge): void { this.erreur = ''; this.form = { ...c }; }

  enregistrer(): void {
    if (!this.form) return;
    const { id, ...body } = this.form;
    const req = id ? this.api.update<Charge>('charges', id, body) : this.api.create<Charge>('charges', body);
    req.subscribe({
      next: () => { this.form = null; this.charger(); },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  supprimer(c: Charge): void {
    if (!confirm(`Supprimer la dépense « ${c.description || c.categorie} » de ${Math.round(Number(c.montant))} € ?`)) return;
    this.api.remove('charges', c.id).subscribe({ next: () => this.charger(), error: (e) => (this.erreur = messageErreur(e)) });
  }
}
