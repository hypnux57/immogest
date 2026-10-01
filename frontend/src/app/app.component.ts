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
        <nav class="side" aria-label="Navigation principale">
          <div class="brand">ImmoGest</div>
          <a routerLink="/tableau" routerLinkActive="on">Vue d'ensemble</a>
          <a routerLink="/loyers" routerLinkActive="on">Loyers</a>
          <a routerLink="/biens" routerLinkActive="on">Biens</a>
          <a routerLink="/locataires" routerLinkActive="on">Locataires</a>
          <a routerLink="/charges" routerLinkActive="on">Dépenses</a>
          <div class="spacer"></div>
          <button class="logout" type="button" (click)="auth.logout()">Se déconnecter</button>
        </nav>
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
