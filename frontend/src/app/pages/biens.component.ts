import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Bien } from '../core/models';
import { EurPipe, messageErreur } from '../core/format';

type BienForm = Omit<Bien, 'id'> & { id?: number };

@Component({
  selector: 'app-biens',
  standalone: true,
  imports: [FormsModule, EurPipe],
  template: `
    <header class="page-head">
      <div><h1>Biens</h1><p class="sub">{{ biens.length }} biens, {{ totalLoyers() | eur }} de loyers par mois</p></div>
      @if (!form) { <button class="btn primary" type="button" (click)="nouveau()">Ajouter un bien</button> }
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }

    @if (form) {
      <form class="panel reveal" (ngSubmit)="enregistrer()">
        <h2>{{ form.id ? 'Modifier le bien' : 'Nouveau bien' }}</h2>
        <div class="form-grid">
          <div class="field wide"><label for="b-nom">Nom ou adresse</label><input id="b-nom" name="nom" [(ngModel)]="form.nom" required></div>
          <div class="field"><label for="b-type">Type</label>
            <select id="b-type" name="type" [(ngModel)]="form.type">
              @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </div>
          <div class="field"><label for="b-statut">Statut</label>
            <select id="b-statut" name="statut" [(ngModel)]="form.statut">
              <option value="Loué">Loué</option><option value="Vacant">Vacant</option><option value="Travaux">Travaux</option>
            </select>
          </div>
          <div class="field"><label for="b-surface">Surface (m²)</label><input id="b-surface" name="surface" type="number" min="0" step="0.1" [(ngModel)]="form.surface"></div>
          <div class="field"><label for="b-loyer">Loyer mensuel (€)</label><input id="b-loyer" name="loyer" type="number" min="0" step="0.01" [(ngModel)]="form.loyer"></div>
          <div class="field"><label for="b-charges">Charges mensuelles (€)</label><input id="b-charges" name="charges" type="number" min="0" step="0.01" [(ngModel)]="form.charges_mens"></div>
          <div class="field"><label for="b-credit">Mensualité du crédit (€)</label><input id="b-credit" name="credit" type="number" min="0" step="0.01" [(ngModel)]="form.credit_mens"></div>
          <div class="field"><label for="b-tf">Taxe foncière annuelle (€)</label><input id="b-tf" name="tf" type="number" min="0" step="0.01" [(ngModel)]="form.taxe_fonciere"></div>
          <div class="field wide"><label for="b-notes">Notes</label><input id="b-notes" name="notes" [(ngModel)]="form.notes"></div>
        </div>
        <div class="form-actions">
          <button class="btn" type="button" (click)="form = null">Annuler</button>
          <button class="btn primary" type="submit" [disabled]="!form.nom">Enregistrer le bien</button>
        </div>
      </form>
    }

    @if (charge && biens.length === 0) {
      <div class="panel empty-state">Aucun bien pour l'instant. Ajoutez votre premier bien pour commencer.</div>
    }

    @if (biens.length) {
      <div class="table-wrap">
        <table class="list">
          <thead><tr>
            <th>Bien</th><th>Statut</th><th class="num">Loyer</th><th class="num">Crédit</th><th class="num">Solde mensuel</th><th></th>
          </tr></thead>
          <tbody>
            @for (b of biens; track b.id) {
              <tr>
                <td><div>{{ b.nom }}</div><div class="secondary">{{ b.type }}@if (b.surface) {, {{ b.surface }} m²}@if (b.notes) { — {{ b.notes }}}</div></td>
                <td><span class="badge" [class.ok]="b.statut === 'Loué'" [class.warn]="b.statut === 'Vacant'" [class.neutre]="b.statut === 'Travaux'">{{ b.statut }}</span></td>
                <td class="num">{{ b.loyer | eur }}</td>
                <td class="num">{{ b.credit_mens | eur }}</td>
                <td class="num" [style.color]="solde(b) < 0 ? 'var(--late)' : 'var(--paid)'">{{ solde(b) | eur }}</td>
                <td><div class="actions">
                  <button class="btn small" type="button" (click)="modifier(b)">Modifier</button>
                  <button class="btn small danger" type="button" (click)="supprimer(b)">Supprimer</button>
                </div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="secondary" style="margin-top:.6rem">Solde mensuel = loyer − crédit − charges − taxe foncière / 12.</p>
    }
  `,
})
export class BiensComponent implements OnInit {
  private api = inject(ApiService);
  biens: Bien[] = [];
  form: BienForm | null = null;
  erreur = '';
  charge = false;
  types = ['Appartement', 'Maison', 'Studio', 'Commerce', 'Parking'];

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.api.list<Bien>('biens').subscribe({
      next: (b) => { this.biens = b; this.charge = true; },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  totalLoyers(): number { return this.biens.reduce((s, b) => s + Number(b.loyer), 0); }
  solde(b: Bien): number {
    return Math.round((Number(b.loyer) - Number(b.credit_mens) - Number(b.charges_mens) - Number(b.taxe_fonciere) / 12) * 100) / 100;
  }

  nouveau(): void {
    this.erreur = '';
    this.form = { nom: '', type: 'Appartement', surface: 0, loyer: 0, charges_mens: 0, credit_mens: 0, taxe_fonciere: 0, statut: 'Loué', notes: '' };
  }

  modifier(b: Bien): void { this.erreur = ''; this.form = { ...b }; }

  enregistrer(): void {
    if (!this.form) return;
    const { id, ...body } = this.form;
    const req = id ? this.api.update<Bien>('biens', id, body) : this.api.create<Bien>('biens', body);
    req.subscribe({
      next: () => { this.form = null; this.charger(); },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  supprimer(b: Bien): void {
    if (!confirm(`Supprimer « ${b.nom} » ? Ses locataires, loyers et dépenses seront aussi supprimés.`)) return;
    this.api.remove('biens', b.id).subscribe({
      next: () => this.charger(),
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }
}
