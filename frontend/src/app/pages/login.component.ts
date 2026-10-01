import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { messageErreur } from '../core/format';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; }
    .card { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 2rem; }
    h1 { margin-bottom: 0.35rem; }
    .intro { color: var(--muted); margin-bottom: 1.5rem; }
    .field { margin-bottom: 1rem; }
    .btn { width: 100%; padding: 0.7rem; }
  `],
  template: `
    <div class="wrap">
      <form class="card reveal" (ngSubmit)="connecter()">
        <h1>ImmoGest</h1>
        <p class="intro">Connectez-vous pour gérer vos locations.</p>
        @if (erreur) { <div class="error" role="alert">{{ erreur }}</div> }
        <div class="field">
          <label for="u">Identifiant</label>
          <input id="u" name="u" autocomplete="username" [(ngModel)]="username" required>
        </div>
        <div class="field">
          <label for="p">Mot de passe</label>
          <input id="p" name="p" type="password" autocomplete="current-password" [(ngModel)]="password" required>
        </div>
        <button class="btn primary" type="submit" [disabled]="enCours || !username || !password">
          {{ enCours ? 'Connexion…' : 'Se connecter' }}
        </button>
      </form>
    </div>
  `,
})
export class LoginComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  password = '';
  erreur = '';
  enCours = false;

  connecter(): void {
    this.enCours = true;
    this.erreur = '';
    this.api.login(this.username.trim(), this.password).subscribe({
      next: (r) => {
        this.auth.setToken(r.access_token);
        this.router.navigate(['/tableau']);
      },
      error: (e) => {
        this.erreur = messageErreur(e);
        this.enCours = false;
      },
    });
  }
}
