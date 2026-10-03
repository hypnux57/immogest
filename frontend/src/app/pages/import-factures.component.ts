import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Bien, Charge } from '../core/models';
import { EurPipe, messageErreur } from '../core/format';
import { analyserTexte, partDeductible } from '../core/analyse-facture';

/** pdf.js est chargé à la demande depuis cdnjs, uniquement quand on importe une facture. */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

interface Facture {
  fichier: string;
  etat: 'lecture' | 'ok' | 'scan' | 'erreur';
  texte: string;
  lignes: string[];
  inclus: boolean;
  date: string | null;
  bien_id: number | null;
  categorie: string;
  description: string;
  montant: number | null;
  montant_deductible: number | null;
  motif: string;
  aVerifier: boolean;
  ligneMontant: string;
  doublon: boolean;
}

async function chargerPdfJs(): Promise<any> {
  const w = window as any;
  if (!w.pdfjsLib) {
    await new Promise<void>((ok, ko) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => ok();
      s.onerror = () => ko(new Error('pdf.js indisponible'));
      document.head.appendChild(s);
    });
    w.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  }
  return w.pdfjsLib;
}

/** Texte du PDF, reconstitué ligne par ligne d'après la position des mots sur la page. */
async function extraireTexte(octets: ArrayBuffer): Promise<string> {
  const lib = await chargerPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(octets) }).promise;
  const lignes: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 6); p++) {
    const page = await pdf.getPage(p);
    const contenu = await page.getTextContent();
    const parLigne = new Map<number, { x: number; s: string }[]>();
    for (const it of contenu.items as any[]) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 4) * 4;
      if (!parLigne.has(y)) parLigne.set(y, []);
      parLigne.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    [...parLigne.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, mots]) => lignes.push(mots.sort((a, b) => a.x - b.x).map((m) => m.s).join(' ')));
  }
  return lignes.join('\n');
}

@Component({
  selector: 'app-import-factures',
  standalone: true,
  imports: [FormsModule, EurPipe],
  styles: [`
    .etapes { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
    .fichier { position: relative; overflow: hidden; }
    .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .depot { border: 1px dashed var(--ink-soft); padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.85rem; margin-bottom: 1.5rem; }
    .depot.survol { background: var(--soft); color: var(--ink); }
    .aide { color: var(--muted); font-size: 0.82rem; max-width: 78ch; margin-bottom: 1.25rem; }
    .facture { border-top: 1px solid var(--ink); padding: 1.25rem 0 1.5rem; }
    .facture.exclue { opacity: 0.5; }
    .entete { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
    .entete label { display: inline-flex; gap: 0.5rem; align-items: center; font-weight: 600; font-size: 0.85rem; }
    .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem 1.25rem; }
    .motif { margin-top: 0.9rem; font-size: 0.82rem; color: var(--muted); max-width: 80ch; }
    .source { font-size: 0.75rem; color: var(--muted); margin-top: 0.35rem; }
    input[type=checkbox] { accent-color: #000; width: 15px; height: 15px; }
    .resume { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; border-top: 1px solid var(--ink); padding-top: 1.25rem; }
  `],
  template: `
    <section class="panel reveal" aria-label="Import de factures PDF">
      <h2>Importer des factures PDF</h2>
      <p class="aide">
        Le montant à payer, la date, le logement et la catégorie sont lus dans la facture, puis la part déductible des revenus fonciers est calculée
        (taxe d’ordures ménagères retirée d’une taxe foncière, charges récupérables retirées d’un appel de charges, mobilier et agrandissements non déductibles…).
        Tout se passe dans votre navigateur : les PDF ne sont envoyés nulle part. Vérifiez chaque facture avant d’enregistrer.
      </p>

      <div class="depot" [class.survol]="survol" (dragover)="$event.preventDefault(); survol = true" (dragleave)="survol = false" (drop)="deposer($event)">
        Glissez vos factures PDF ici, ou
        <label class="btn small primary fichier" style="margin-left:.5rem">
          choisissez des fichiers
          <input type="file" accept="application/pdf,.pdf" multiple (change)="choisir($event)" aria-label="Factures PDF">
        </label>
      </div>
      @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }

      @for (f of factures; track $index) {
        <article class="facture" [class.exclue]="!f.inclus">
          <div class="entete">
            <label><input type="checkbox" [(ngModel)]="f.inclus" [disabled]="f.etat === 'lecture' || f.montant === null || f.bien_id === null || !f.date"> {{ f.fichier }}</label>
            <span>
              @switch (f.etat) {
                @case ('lecture') { <span class="badge neutre">Lecture…</span> }
                @case ('scan') { <span class="badge retard">PDF scanné : à compléter</span> }
                @case ('erreur') { <span class="badge retard">Illisible</span> }
                @default {
                  @if (f.doublon) { <span class="badge attente">Déjà saisie</span> }
                  @else if (f.aVerifier) { <span class="badge attente">À vérifier</span> }
                  @else { <span class="badge paye">OK</span> }
                }
              }
              <button class="btn small danger" type="button" style="margin-left:.5rem" (click)="retirer($index)">Retirer</button>
            </span>
          </div>
          @if (f.etat !== 'lecture') {
            <div class="grille">
              <div class="field"><label>Date</label><input type="date" [(ngModel)]="f.date" (ngModelChange)="controler(f)"></div>
              <div class="field"><label>Bien</label>
                <select [(ngModel)]="f.bien_id" (ngModelChange)="controler(f)">
                  <option [ngValue]="null">— choisir —</option>
                  @for (b of biens; track b.id) { <option [ngValue]="b.id">{{ court(b.nom) }}</option> }
                </select>
              </div>
              <div class="field"><label>Catégorie</label>
                <select [(ngModel)]="f.categorie" (ngModelChange)="recalculer(f)">
                  @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
                </select>
              </div>
              <div class="field"><label>Montant payé (€)</label><input type="number" min="0" step="0.01" [(ngModel)]="f.montant" (ngModelChange)="recalculer(f)"></div>
              <div class="field"><label>Dont déductible (€)</label><input type="number" min="0" step="0.01" [(ngModel)]="f.montant_deductible"></div>
              <div class="field wide"><label>Description</label><input [(ngModel)]="f.description"></div>
            </div>
            @if (f.motif) { <p class="motif">{{ f.motif }}</p> }
            @if (f.ligneMontant) { <p class="source">Montant lu sur la ligne : « {{ f.ligneMontant }} »</p> }
          }
        </article>
      }

      @if (factures.length) {
        <div class="resume">
          <span class="secondary">{{ aEnregistrer().length }} facture(s) · {{ total('montant') | eur }} payés · {{ total('montant_deductible') | eur }} déductibles</span>
          <span style="display:flex;gap:.6rem">
            <button class="btn" type="button" (click)="annuler.emit()">Fermer</button>
            <button class="btn primary" type="button" [disabled]="!aEnregistrer().length || envoi" (click)="enregistrer()">
              {{ envoi ? 'Enregistrement…' : 'Enregistrer ' + aEnregistrer().length + ' facture(s)' }}
            </button>
          </span>
        </div>
      } @else {
        <div class="etapes"><button class="btn" type="button" (click)="annuler.emit()">Fermer</button></div>
      }
    </section>
  `,
})
export class ImportFacturesComponent {
  private api = inject(ApiService);
  @Input() biens: Bien[] = [];
  @Input() charges: Charge[] = [];
  @Input() categories: string[] = [];
  @Output() termine = new EventEmitter<number>();
  @Output() annuler = new EventEmitter<void>();

  factures: Facture[] = [];
  erreur = '';
  envoi = false;
  survol = false;

  choisir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.ajouter(Array.from(input.files ?? []));
    input.value = '';
  }

  deposer(ev: DragEvent): void {
    ev.preventDefault();
    this.survol = false;
    this.ajouter(Array.from(ev.dataTransfer?.files ?? []));
  }

  private ajouter(fichiers: File[]): void {
    this.erreur = '';
    const pdfs = fichiers.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdfs.length < fichiers.length) this.erreur = 'Seuls les fichiers PDF sont pris en compte.';
    for (const fichier of pdfs) {
      const f: Facture = {
        fichier: fichier.name, etat: 'lecture', texte: '', lignes: [], inclus: false, date: null, bien_id: null, categorie: 'Autre',
        description: fichier.name.replace(/\.pdf$/i, ''), montant: null, montant_deductible: null, motif: '', aVerifier: true, ligneMontant: '', doublon: false,
      };
      this.factures.push(f);
      this.lire(f, fichier);
    }
  }

  private async lire(f: Facture, fichier: File): Promise<void> {
    try {
      f.texte = await extraireTexte(await fichier.arrayBuffer());
      f.lignes = f.texte.split('\n');
      if (f.texte.replace(/\s/g, '').length < 30) {
        f.etat = 'scan';
        f.motif = 'Ce PDF ne contient pas de texte (document scanné ou photo) : saisissez le montant, la date et le bien.';
        return;
      }
      const a = analyserTexte(f.texte, this.biens);
      Object.assign(f, {
        etat: 'ok', date: a.date, bien_id: a.bien_id, categorie: this.categories.includes(a.categorie) ? a.categorie : 'Autre',
        montant: a.montant, montant_deductible: a.montant_deductible, motif: a.motif, aVerifier: a.aVerifier, ligneMontant: a.ligneMontant,
        description: [a.fournisseur, a.numero ? `n° ${a.numero}` : ''].filter(Boolean).join(' – ') || f.description,
      });
      this.controler(f);
    } catch {
      f.etat = 'erreur';
      f.motif = 'Impossible de lire ce PDF (protégé par mot de passe ou endommagé).';
    }
  }

  /** Recalcule la part déductible quand on change la catégorie ou le montant. */
  recalculer(f: Facture): void {
    const d = partDeductible(f.categorie, f.montant, f.texte, f.lignes);
    f.montant_deductible = d.deductible;
    f.motif = d.motif;
    f.aVerifier = d.aVerifier;
    this.controler(f);
  }

  controler(f: Facture): void {
    const complet = f.montant !== null && f.bien_id !== null && !!f.date;
    f.doublon = complet && this.charges.some((c) => c.bien_id === f.bien_id && c.date === f.date && Number(c.montant).toFixed(2) === Number(f.montant).toFixed(2));
    f.inclus = complet && !f.doublon;
  }

  retirer(i: number): void { this.factures.splice(i, 1); }
  court(nom: string): string { return nom.split('–')[0].trim(); }
  aEnregistrer(): Facture[] { return this.factures.filter((f) => f.inclus && f.montant !== null && f.bien_id !== null && f.date); }
  total(champ: 'montant' | 'montant_deductible'): number { return this.aEnregistrer().reduce((s, f) => s + Number(f[champ] ?? f.montant ?? 0), 0); }

  enregistrer(): void {
    const depenses = this.aEnregistrer().map((f) => ({
      bien_id: f.bien_id, date: f.date, categorie: f.categorie, description: f.description,
      montant: Math.round(Number(f.montant) * 100) / 100,
      montant_deductible: f.montant_deductible === null ? null : Math.round(Number(f.montant_deductible) * 100) / 100,
      justificatif: f.fichier,
    }));
    this.envoi = true;
    this.erreur = '';
    this.api.importerDepenses(depenses).subscribe({
      next: (r) => { this.envoi = false; this.termine.emit(r.importees); },
      error: (e) => { this.envoi = false; this.erreur = messageErreur(e); },
    });
  }
}
