import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Bien, Locataire, Paiement } from '../core/models';
import { EurPipe, dateFr, messageErreur, moisCourant, moisLabel } from '../core/format';

type PaiementForm = Omit<Paiement, 'id'> & { id?: number };

@Component({
  selector: 'app-loyers',
  standalone: true,
  imports: [FormsModule, EurPipe],
  styles: [`
    .toolbar { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .toolbar input { width: auto; }
    .summary { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1rem; color: var(--muted); }
    .summary strong { color: var(--ink); font-variant-numeric: tabular-nums; }
  `],
  template: `
    <header class="page-head">
      <div><h1>Loyers</h1><p class="sub">{{ label(mois) }}</p></div>
      <div class="toolbar">
        <label class="secondary" for="mois">Mois</label>
        <input id="mois" class="inline-input" type="month" [(ngModel)]="mois" (ngModelChange)="charger()">
        <button class="btn" type="button" (click)="generer()" [disabled]="!locataires.length">Créer les échéances du mois</button>
        @if (!form) { <button class="btn primary" type="button" (click)="nouveau()" [disabled]="!locataires.length">Enregistrer un paiement</button> }
      </div>
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
    @if (info) { <div class="panel" role="status">{{ info }}</div> }

    @if (form) {
      <form class="panel reveal" (ngSubmit)="enregistrer()">
        <h2>{{ form.id ? 'Modifier le paiement' : 'Nouveau paiement' }}</h2>
        <div class="form-grid">
          <div class="field"><label for="p-loc">Locataire</label>
            <select id="p-loc" name="loc" [(ngModel)]="form.locataire_id" (ngModelChange)="locChange($event)">
              @for (l of locataires; track l.id) { <option [ngValue]="l.id">{{ l.prenom }} {{ l.nom }} — {{ nomBien(l.bien_id) }}</option> }
            </select>
          </div>
          <div class="field"><label for="p-mois">Mois concerné</label><input id="p-mois" name="pmois" type="month" [(ngModel)]="form.mois" required></div>
          <div class="field"><label for="p-montant">Montant (€)</label><input id="p-montant" name="montant" type="number" min="0" step="0.01" [(ngModel)]="form.montant"></div>
          <div class="field"><label for="p-statut">Statut</label>
            <select id="p-statut" name="statut" [(ngModel)]="form.statut">
              <option value="Payé">Payé</option><option value="En attente">En attente</option><option value="En retard">En retard</option>
            </select>
          </div>
          <div class="field"><label for="p-date">Date de réception</label><input id="p-date" name="date" type="date" [(ngModel)]="form.date_paiement"></div>
        </div>
        <div class="form-actions">
          <button class="btn" type="button" (click)="form = null">Annuler</button>
          <button class="btn primary" type="submit">Enregistrer le paiement</button>
        </div>
      </form>
    }

    <div class="summary">
      <span>Encaissé <strong>{{ total('Payé') | eur }}</strong></span>
      <span>En attente <strong>{{ total('En attente') | eur }}</strong></span>
      <span>En retard <strong>{{ total('En retard') | eur }}</strong></span>
    </div>

    @if (charge && !paiements.length) {
      <div class="panel empty-state">Aucune échéance pour {{ label(mois) }}. Cliquez sur « Créer les échéances du mois » pour préparer un loyer par locataire.</div>
    }

    @if (paiements.length) {
      <div class="table-wrap">
        <table class="list">
          <thead><tr><th>Locataire</th><th>Bien</th><th class="num">Montant</th><th>Statut</th><th>Reçu le</th><th></th></tr></thead>
          <tbody>
            @for (p of paiements; track p.id) {
              <tr>
                <td>{{ nomLoc(p.locataire_id) }}</td>
                <td>{{ bienDuLoc(p.locataire_id) }}</td>
                <td class="num">{{ p.montant | eur }}</td>
                <td><span class="badge" [class.paye]="p.statut === 'Payé'" [class.attente]="p.statut === 'En attente'" [class.retard]="p.statut === 'En retard'">{{ p.statut }}</span></td>
                <td>{{ fr(p.date_paiement) }}</td>
                <td><div class="actions">
                  @if (p.statut !== 'Payé') {
                    <button class="btn small primary" type="button" (click)="payer(p)">Marquer payé</button>
                    @if (p.statut !== 'En retard') { <button class="btn small" type="button" (click)="retard(p)">En retard</button> }
                  }
                  <button class="btn small" type="button" (click)="modifier(p)">Modifier</button>
                  <button class="btn small danger" type="button" (click)="supprimer(p)">Supprimer</button>
                </div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class LoyersComponent implements OnInit {
  private api = inject(ApiService);
  mois = moisCourant();
  biens: Bien[] = [];
  locataires: Locataire[] = [];
  paiements: Paiement[] = [];
  form: PaiementForm | null = null;
  erreur = '';
  info = '';
  charge = false;

  ngOnInit(): void { this.charger(); }

  charger(): void {
    if (!this.mois) return;
    this.erreur = '';
    forkJoin({
      b: this.api.list<Bien>('biens'),
      l: this.api.list<Locataire>('locataires'),
      p: this.api.paiementsDuMois(this.mois),
    }).subscribe({
      next: ({ b, l, p }) => { this.biens = b; this.locataires = l; this.paiements = p; this.charge = true; },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  label(m: string): string { return m ? moisLabel(m) : ''; }
  fr(iso: string | null): string { return dateFr(iso); }
  nomBien(id: number): string { return this.biens.find((b) => b.id === id)?.nom ?? '—'; }
  nomLoc(id: number): string { const l = this.locataires.find((x) => x.id === id); return l ? `${l.prenom} ${l.nom}`.trim() : '—'; }
  bienDuLoc(id: number): string { const l = this.locataires.find((x) => x.id === id); return l ? this.nomBien(l.bien_id) : '—'; }
  total(statut: Paiement['statut']): number {
    return this.paiements.filter((p) => p.statut === statut).reduce((s, p) => s + Number(p.montant), 0);
  }

  generer(): void {
    this.info = '';
    this.api.genererMois(this.mois).subscribe({
      next: (crees) => {
        this.info = crees.length
          ? `${crees.length} échéance(s) créée(s) pour ${moisLabel(this.mois)}.`
          : `Toutes les échéances de ${moisLabel(this.mois)} existent déjà.`;
        this.charger();
      },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  payer(p: Paiement): void {
    this.api.payer(p.id).subscribe({ next: () => this.charger(), error: (e) => (this.erreur = messageErreur(e)) });
  }

  retard(p: Paiement): void {
    const { id, ...body } = p;
    this.api.update<Paiement>('paiements', id, { ...body, statut: 'En retard' }).subscribe({
      next: () => this.charger(),
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  locChange(id: number): void {
    const l = this.locataires.find((x) => x.id === id);
    if (this.form && l && !this.form.id) this.form.montant = Number(l.loyer);
  }

  nouveau(): void {
    const l = this.locataires[0];
    this.erreur = '';
    this.form = {
      locataire_id: l.id, mois: this.mois, montant: Number(l.loyer), statut: 'Payé',
      date_paiement: new Date().toISOString().slice(0, 10),
    };
  }

  modifier(p: Paiement): void { this.erreur = ''; this.form = { ...p }; }

  enregistrer(): void {
    if (!this.form) return;
    const { id, ...rest } = this.form;
    const body = { ...rest, date_paiement: rest.date_paiement || null };
    const req = id ? this.api.update<Paiement>('paiements', id, body) : this.api.create<Paiement>('paiements', body);
    req.subscribe({
      next: () => { this.form = null; this.charger(); },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  supprimer(p: Paiement): void {
    if (!confirm(`Supprimer le paiement de ${this.nomLoc(p.locataire_id)} pour ${moisLabel(p.mois)} ?`)) return;
    this.api.remove('paiements', p.id).subscribe({ next: () => this.charger(), error: (e) => (this.erreur = messageErreur(e)) });
  }
}
