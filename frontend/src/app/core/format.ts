import { Pipe, PipeTransform } from '@angular/core';

const EUR0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUR2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Pipe({ name: 'eur', standalone: true })
export class EurPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return (Number.isInteger(n) ? EUR0 : EUR2).format(n);
  }
}

export function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function moisLabel(mois: string, court = false): string {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('fr-FR', court ? { month: 'short' } : { month: 'long', year: 'numeric' });
}

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function messageErreur(err: any): string {
  const detail = err?.error?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((x: any) => x?.msg ?? '').join(' ; ');
  if (err?.status === 0) {
    return "Le serveur ne répond pas. Sur l'offre gratuite il se réveille en une minute environ : réessayez dans un instant.";
  }
  return `Erreur ${err?.status ?? ''} : l'opération n'a pas abouti.`;
}
