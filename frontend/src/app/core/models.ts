export type Resource = 'biens' | 'locataires' | 'paiements' | 'charges';

export interface Bien {
  id: number;
  nom: string;
  type: string;
  surface: number;
  loyer: number;
  charges_mens: number;
  credit_mens: number;
  taxe_fonciere: number;
  statut: 'Loué' | 'Vacant' | 'Travaux';
  notes: string;
}

export interface Locataire {
  id: number;
  prenom: string;
  nom: string;
  email: string;
  tel: string;
  bien_id: number;
  loyer: number;
  depot: number;
  echeance: number;
  debut: string | null;
  fin: string | null;
  notes: string;
}

export interface Paiement {
  id: number;
  locataire_id: number;
  mois: string;
  montant: number;
  date_paiement: string | null;
  statut: 'Payé' | 'En attente' | 'En retard';
}

export interface Charge {
  id: number;
  bien_id: number;
  categorie: string;
  description: string;
  montant: number;
  date: string;
}

export interface RegistreCell { mois: string; statut: 'paye' | 'attente' | 'retard' | 'vide'; montant: number; }
export interface RegistreRow { bien_id: number; nom: string; cells: RegistreCell[]; }

export interface Dashboard {
  mois_courant: string;
  mois: string[];
  loyers_attendus: number;
  encaisse_mois: number;
  attente_mois: number;
  credits_mensuels: number;
  charges_fixes_mensuelles: number;
  cashflow_mensuel: number;
  biens_loues: number;
  biens_total: number;
  revenus_mois: number[];
  charges_mois: number[];
  registre: RegistreRow[];
  baux_a_echeance: { locataire_id: number; nom: string; fin: string }[];
}
