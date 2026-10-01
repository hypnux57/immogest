import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.loggedIn()) {
      <div class="shell">
        <header class="top">
          <a class="brand" routerLink="/tableau">IMMOGEST</a>
          <button class="logout" type="button" (click)="auth.logout()">Se déconnecter</button>
          <nav class="nav" aria-label="Navigation principale">
            <a routerLink="/tableau" routerLinkActive="on">Vue d'ensemble</a>
            <a routerLink="/loyers" routerLinkActive="on">Loyers</a>
            <a routerLink="/biens" routerLinkActive="on">Biens</a>
            <a routerLink="/locataires" routerLinkActive="on">Locataires</a>
            <a routerLink="/charges" routerLinkActive="on">Dépenses</a>
          </nav>
        </header>
        <main class="main"><router-outlet /></main>
      </div>
    } @else {
      <router-outlet />
    }
  `,
})
export class AppComponent {
  auth = inject(AuthService);
}
