import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Bien, Locataire } from '../core/models';
import { EurPipe, dateFr, messageErreur } from '../core/format';

type LocataireForm = Omit<Locataire, 'id'> & { id?: number };

@Component({
  selector: 'app-locataires',
  standalone: true,
  imports: [FormsModule, EurPipe],
  template: `
    <header class="page-head">
      <div><h1>Locataires</h1><p class="sub">{{ locataires.length }} baux en cours</p></div>
      @if (!form) { <button class="btn primary" type="button" (click)="nouveau()" [disabled]="!biens.length">Ajouter un locataire</button> }
    </header>

    @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
    @if (charge && !biens.length) { <div class="panel empty-state">Ajoutez d'abord un bien dans l'onglet Biens.</div> }

    @if (form) {
      <form class="panel reveal" (ngSubmit)="enregistrer()">
        <h2>{{ form.id ? 'Modifier le locataire' : 'Nouveau locataire' }}</h2>
        <div class="form-grid">
          <div class="field"><label for="l-prenom">Prénom</label><input id="l-prenom" name="prenom" [(ngModel)]="form.prenom" required></div>
          <div class="field"><label for="l-nom">Nom</label><input id="l-nom" name="nom" [(ngModel)]="form.nom"></div>
          <div class="field"><label for="l-email">E-mail</label><input id="l-email" name="email" type="email" [(ngModel)]="form.email"></div>
          <div class="field"><label for="l-tel">Téléphone</label><input id="l-tel" name="tel" type="tel" [(ngModel)]="form.tel"></div>
          <div class="field"><label for="l-bien">Bien loué</label>
            <select id="l-bien" name="bien" [(ngModel)]="form.bien_id" (ngModelChange)="bienChange($event)">
              @for (b of biens; track b.id) { <option [ngValue]="b.id">{{ b.nom }}</option> }
            </select>
          </div>
          <div class="field"><label for="l-loyer">Loyer charges comprises (€)</label><input id="l-loyer" name="loyer" type="number" min="0" step="0.01" [(ngModel)]="form.loyer"></div>
          <div class="field"><label for="l-depot">Dépôt de garantie (€)</label><input id="l-depot" name="depot" type="number" min="0" step="0.01" [(ngModel)]="form.depot"></div>
          <div class="field"><label for="l-ech">Jour d'échéance</label><input id="l-ech" name="ech" type="number" min="1" max="28" [(ngModel)]="form.echeance"></div>
          <div class="field"><label for="l-debut">Début du bail</label><input id="l-debut" name="debut" type="date" [(ngModel)]="form.debut"></div>
          <div class="field"><label for="l-fin">Fin du bail</label><input id="l-fin" name="fin" type="date" [(ngModel)]="form.fin"></div>
          <div class="field wide"><label for="l-notes">Notes</label><input id="l-notes" name="notes" [(ngModel)]="form.notes"></div>
        </div>
        <div class="form-actions">
          <button class="btn" type="button" (click)="form = null">Annuler</button>
          <button class="btn primary" type="submit" [disabled]="!form.prenom || !form.bien_id">Enregistrer le locataire</button>
        </div>
      </form>
    }

    @if (locataires.length) {
      <div class="table-wrap">
        <table class="list">
          <thead><tr><th>Locataire</th><th>Bien</th><th>Bail</th><th class="num">Loyer</th><th class="num">Dépôt</th><th></th></tr></thead>
          <tbody>
            @for (l of locataires; track l.id) {
              <tr>
                <td><div>{{ l.prenom }} {{ l.nom }}</div><div class="secondary">{{ l.email || l.tel || l.notes }}</div></td>
                <td>{{ nomBien(l.bien_id) }}</td>
                <td>
                  <div class="secondary">{{ fr(l.debut) }} → {{ fr(l.fin) }}</div>
                  @if (etatBail(l); as e) { <span class="badge" [class]="'badge ' + e.cls">{{ e.txt }}</span> }
                </td>
                <td class="num">{{ l.loyer | eur }}</td>
                <td class="num">{{ l.depot | eur }}</td>
                <td><div class="actions">
                  <button class="btn small" type="button" (click)="modifier(l)">Modifier</button>
                  <button class="btn small danger" type="button" (click)="supprimer(l)">Supprimer</button>
                </div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class LocatairesComponent implements OnInit {
  private api = inject(ApiService);
  biens: Bien[] = [];
  locataires: Locataire[] = [];
  form: LocataireForm | null = null;
  erreur = '';
  charge = false;

  ngOnInit(): void { this.charger(); }

  charger(): void {
    forkJoin({ b: this.api.list<Bien>('biens'), l: this.api.list<Locataire>('locataires') }).subscribe({
      next: ({ b, l }) => { this.biens = b; this.locataires = l; this.charge = true; },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  nomBien(id: number): string { return this.biens.find((b) => b.id === id)?.nom ?? '—'; }
  fr(iso: string | null): string { return dateFr(iso); }

  etatBail(l: Locataire): { cls: string; txt: string } | null {
    if (!l.fin) return null;
    const jours = Math.round((new Date(l.fin).getTime() - Date.now()) / 86400000);
    if (jours < 0) return { cls: 'bad', txt: 'Bail terminé' };
    if (jours <= 90) return { cls: 'warn', txt: `Fin dans ${jours} j` };
    return { cls: 'ok', txt: 'En cours' };
  }

  bienChange(id: number): void {
    const b = this.biens.find((x) => x.id === id);
    if (this.form && b && !this.form.id && !this.form.loyer) this.form.loyer = Number(b.loyer);
  }

  nouveau(): void {
    this.erreur = '';
    const b = this.biens[0];
    this.form = { prenom: '', nom: '', email: '', tel: '', bien_id: b.id, loyer: Number(b.loyer), depot: 0, echeance: 5, debut: null, fin: null, notes: '' };
  }

  modifier(l: Locataire): void { this.erreur = ''; this.form = { ...l }; }

  enregistrer(): void {
    if (!this.form) return;
    const { id, ...rest } = this.form;
    const body = { ...rest, debut: rest.debut || null, fin: rest.fin || null };
    const req = id ? this.api.update<Locataire>('locataires', id, body) : this.api.create<Locataire>('locataires', body);
    req.subscribe({
      next: () => { this.form = null; this.charger(); },
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }

  supprimer(l: Locataire): void {
    if (!confirm(`Supprimer ${l.prenom} ${l.nom} ? Son historique de loyers sera aussi supprimé.`)) return;
    this.api.remove('locataires', l.id).subscribe({
      next: () => this.charger(),
      error: (e) => (this.erreur = messageErreur(e)),
    });
  }
}
