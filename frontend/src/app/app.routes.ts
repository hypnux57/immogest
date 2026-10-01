import { Routes } from '@angular/router';
import { authGuard } from './core/auth';

export const routes: Routes = [
  { path: 'connexion', loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau' },
      { path: 'tableau', loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'biens', loadComponent: () => import('./pages/biens.component').then((m) => m.BiensComponent) },
      { path: 'locataires', loadComponent: () => import('./pages/locataires.component').then((m) => m.LocatairesComponent) },
      { path: 'loyers', loadComponent: () => import('./pages/loyers.component').then((m) => m.LoyersComponent) },
      { path: 'charges', loadComponent: () => import('./pages/charges.component').then((m) => m.ChargesComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
