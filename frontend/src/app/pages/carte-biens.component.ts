import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Bien } from '../core/models';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

@Component({
  selector: 'app-carte-biens',
  standalone: true,
  template: `<div #carte class="carte" role="region" aria-label="Carte des biens"></div>`,
})
export class CarteBiensComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() biens: Bien[] = [];
  /** Identifiant du bien sur lequel centrer la carte. */
  @Input() focus: number | null = null;
  @ViewChild('carte', { static: true }) conteneur!: ElementRef<HTMLDivElement>;

  private L: typeof Leaflet | null = null;
  private carte: Leaflet.Map | null = null;
  private calque: Leaflet.LayerGroup | null = null;
  private marqueurs = new Map<number, Leaflet.Marker>();

  async ngAfterViewInit(): Promise<void> {
    // Leaflet n'est chargé que lorsqu'on affiche la carte
    this.L = await import('leaflet');
    const L = this.L;
    this.carte = L.map(this.conteneur.nativeElement, { scrollWheelZoom: false, zoomControl: true }).setView([48.85, 4.5], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.carte);
    this.calque = L.layerGroup().addTo(this.carte);
    this.dessiner(true);
  }

  ngOnChanges(): void {
    if (!this.carte) return;
    this.dessiner(false);
  }

  ngOnDestroy(): void { this.carte?.remove(); }

  private dessiner(cadrer: boolean): void {
    const L = this.L!;
    this.calque!.clearLayers();
    this.marqueurs.clear();
    const places = this.biens.filter((b) => b.latitude != null && b.longitude != null);
    for (const b of places) {
      const icone = L.divIcon({
        className: 'pin' + (b.statut !== 'Loué' ? ' vacant' : ''),
        html: `<span>${echapper(b.nom.split('–')[0].trim())}</span>`,
        iconSize: undefined,
        popupAnchor: [0, -30],
      });
      const adresse = [b.adresse, [b.code_postal, b.ville].filter(Boolean).join(' ')].filter(Boolean).map(echapper).join('<br>');
      const m = L.marker([b.latitude!, b.longitude!], { icon: icone, title: b.nom })
        .bindPopup(`<strong>${echapper(b.nom)}</strong>${adresse}<br>${EUR.format(Number(b.loyer))} / mois · ${echapper(b.statut)}`)
        .addTo(this.calque!);
      this.marqueurs.set(b.id, m);
    }
    const cible = this.focus != null ? this.marqueurs.get(this.focus) : undefined;
    if (cible) {
      this.carte!.flyTo(cible.getLatLng(), 16, { duration: 0.8 });
      cible.openPopup();
    } else if (cadrer && places.length) {
      this.carte!.fitBounds(L.latLngBounds(places.map((b) => [b.latitude!, b.longitude!] as [number, number])), { padding: [50, 50], maxZoom: 15 });
    }
  }

  /** Recadre la carte sur un groupe de biens (ex. ceux d'une même ville). */
  cadrer(ids: number[]): void {
    if (!this.L || !this.carte) return;
    const pts = this.biens.filter((b) => ids.includes(b.id) && b.latitude != null).map((b) => [b.latitude!, b.longitude!] as [number, number]);
    if (pts.length) this.carte.flyToBounds(this.L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15, duration: 0.8 });
  }
}
