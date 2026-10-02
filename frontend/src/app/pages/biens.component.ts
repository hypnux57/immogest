import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Bien } from '../core/models';
import { EurPipe, messageErreur } from '../core/format';
import { geocoder } from '../core/geocodage';
import { CarteBiensComponent } from './carte-biens.component';

type BienForm = Omit<Bien, 'id'> & { id?: number };

@Component({
  selector: 'app-biens',
  standalone: true,
  imports: [FormsModule, EurPipe, CarteBiensComponent],
  styles: [`
    .villes { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .adresse { color: var(--muted); font-size: 0.82rem; }
    .lien { background: none; border: 0; padding: 0; font: inherit; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; font-size: 0.78rem; }
    .info { font-size: 0.82rem; color: var(--muted); margin-top: 0.75rem; }
  `],
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
          <div class="field wide"><label for="b-nom">Nom du bien</label><input id="b-nom" name="nom" [(ngModel)]="form.nom" required></div>
          <div class="field wide"><label for="b-adresse">Adresse</label><input id="b-adresse" name="adresse" autocomplete="street-address" placeholder="16 rue Foch" [(ngModel)]="form.adresse"></div>
          <div class="field"><label for="b-cp">Code postal</label><input id="b-cp" name="cp" inputmode="numeric" maxlength="10" [(ngModel)]="form.code_postal"></div>
          <div class="field"><label for="b-ville">Ville</label><input id="b-ville" name="ville" [(ngModel)]="form.ville"></div>
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
          <div class="field"><label for="b-pno">Assurance PNO annuelle (€)</label><input id="b-pno" name="pno" type="number" min="0" step="0.01" [(ngModel)]="form.assurance_pno"></div>
          <div class="field"><label for="b-annee">Année d'achat</label><input id="b-annee" name="annee" type="number" min="1950" max="2100" [(ngModel)]="form.annee_achat"></div>
          <div class="field"><label for="b-prix">Coût d'acquisition total (€)</label><input id="b-prix" name="prix" type="number" min="0" step="1" [(ngModel)]="form.prix_achat"></div>
          <div class="field"><label for="b-valeur">Valeur estimée aujourd'hui (€)</label><input id="b-valeur" name="valeur" type="number" min="0" step="1" [(ngModel)]="form.valeur_actuelle"></div>
          <div class="field"><label for="b-int">Intérêts d'emprunt annuels (€)</label><input id="b-int" name="int" type="number" min="0" step="0.01" [(ngModel)]="form.interets_annuels"></div>
          <div class="field"><label for="b-qp">Part louée du logement (%)</label><input id="b-qp" name="qp" type="number" min="0" max="100" step="1" [(ngModel)]="form.quote_part"></div>
          <div class="field wide"><label for="b-notes">Notes</label><input id="b-notes" name="notes" [(ngModel)]="form.notes"></div>
        </div>
        <div class="form-actions">
          <button class="btn" type="button" (click)="form = null">Annuler</button>
          <button class="btn primary" type="submit" [disabled]="!form.nom || enCours">{{ enCours ? 'Localisation…' : 'Enregistrer le bien' }}</button>
        </div>
        <p class="info">L'adresse est localisée automatiquement sur la carte à l'enregistrement.</p>
      </form>
    }
    @if (info) { <div class="panel" role="status">{{ info }}</div> }

    @if (charge && biens.length === 0) {
      <div class="panel empty-state">Aucun bien pour l'instant. Ajoutez votre premier bien pour commencer.</div>
    }

    @if (biens.length) {
      @if (villes().length > 1) {
        <div class="villes" role="group" aria-label="Recadrer la carte">
          <button class="btn small" type="button" (click)="carte?.cadrer(tousIds())">Tous les biens</button>
          @for (v of villes(); track v.nom) {
            <button class="btn small" type="button" (click)="carte?.cadrer(v.ids)">{{ v.nom }}</button>
          }
        </div>
      }
      <app-carte-biens [biens]="biens" [focus]="focus" />
      @if (sansPosition().length) {
        <p class="info" style="margin-top:-1.75rem;margin-bottom:2rem">Pas encore sur la carte : {{ sansPosition().join(', ') }}. Ajoutez leur adresse avec « Modifier ».</p>
      }
      <div class="table-wrap">
        <table class="list">
          <thead><tr>
            <th>Bien</th><th>Statut</th><th class="num">Loyer</th><th class="num">Crédit</th><th class="num">Solde mensuel</th><th></th>
          </tr></thead>
          <tbody>
            @for (b of biens; track b.id) {
              <tr>
                <td><div>{{ b.nom }}</div>
                  @if (b.adresse || b.ville) {
                    <div class="adresse">{{ b.adresse }}{{ b.adresse && b.ville ? ', ' : '' }}{{ b.code_postal }} {{ b.ville }}
                      @if (b.latitude != null) { · <button class="lien" type="button" (click)="voir(b)">Voir sur la carte</button> }
                    </div>
                  }
                  <div class="secondary">{{ b.type }}@if (b.surface) {, {{ b.surface }} m²}@if (b.notes) { — {{ b.notes }}}</div></td>
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
      <p class="secondary" style="margin-top:.6rem">Solde mensuel = loyer − crédit − charges − (taxe foncière + assurance PNO) / 12.</p>
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
  focus: number | null = null;
  enCours = false;
  info = '';
  private adresseInitiale = '';
  @ViewChild(CarteBiensComponent) carte?: CarteBiensComponent;

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.api.list<Bien>('biens').subscribe({
      next: (b) => { this.biens = b; this.charge = true; },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  totalLoyers(): number { return this.biens.reduce((s, b) => s + Number(b.loyer), 0); }
  solde(b: Bien): number {
    return Math.round((Number(b.loyer) - Number(b.credit_mens) - Number(b.charges_mens) - Number(b.taxe_fonciere) / 12 - Number(b.assurance_pno) / 12) * 100) / 100;
  }

  nouveau(): void {
    this.erreur = '';
    this.form = { nom: '', type: 'Appartement', surface: 0, loyer: 0, charges_mens: 0, credit_mens: 0, taxe_fonciere: 0, assurance_pno: 0, annee_achat: null, prix_achat: 0, valeur_actuelle: 0, interets_annuels: 0, quote_part: 100, adresse: '', code_postal: '', ville: '', latitude: null, longitude: null, statut: 'Loué', notes: '' };
    this.adresseInitiale = '';
  }

  modifier(b: Bien): void {
    this.erreur = '';
    this.info = '';
    this.form = { ...b };
    this.adresseInitiale = this.cleAdresse(b);
  }

  voir(b: Bien): void {
    this.focus = null;
    setTimeout(() => (this.focus = b.id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  villes(): { nom: string; ids: number[] }[] {
    const m = new Map<string, number[]>();
    for (const b of this.biens) if (b.ville && b.latitude != null) m.set(b.ville, [...(m.get(b.ville) ?? []), b.id]);
    return [...m.entries()].map(([nom, ids]) => ({ nom, ids }));
  }
  tousIds(): number[] { return this.biens.map((b) => b.id); }
  sansPosition(): string[] { return this.biens.filter((b) => b.latitude == null).map((b) => b.nom); }

  private cleAdresse(b: { adresse?: string; code_postal?: string; ville?: string }): string {
    return [b.adresse, b.code_postal, b.ville].map((x) => (x || '').trim().toLowerCase()).join('|');
  }

  async enregistrer(): Promise<void> {
    if (!this.form) return;
    this.info = '';
    const f = this.form;
    const aAdresse = !!(f.adresse || f.ville);
    // Localise l'adresse si elle est nouvelle ou a changé
    if (aAdresse && (this.cleAdresse(f) !== this.adresseInitiale || f.latitude == null)) {
      this.enCours = true;
      const pos = await geocoder(f.adresse, f.code_postal, f.ville);
      this.enCours = false;
      if (pos) { f.latitude = pos.lat; f.longitude = pos.lng; }
      else { f.latitude = null; f.longitude = null; this.info = `Adresse introuvable : « ${[f.adresse, f.code_postal, f.ville].filter(Boolean).join(' ')} ». Le bien est enregistré mais n'apparaît pas sur la carte.`; }
    }
    if (!aAdresse) { f.latitude = null; f.longitude = null; }
    const { id, ...body } = f;
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
