import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

const KEY = 'immogest_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  readonly token = signal<string | null>(AuthService.read());
  readonly loggedIn = computed(() => !!this.token());

  private static read(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  setToken(token: string): void {
    try { localStorage.setItem(KEY, token); } catch { /* stockage indisponible : session seulement */ }
    this.token.set(token);
  }

  logout(): void {
    try { localStorage.removeItem(KEY); } catch { /* rien */ }
    this.token.set(null);
    this.router.navigate(['/connexion']);
  }
}
