import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Dashboard, Paiement, Resource } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl.replace(/\/$/, '');

  login(username: string, password: string): Observable<{ access_token: string }> {
    return this.http.post<{ access_token: string }>(`${this.base}/auth/login`, { username, password });
  }

  list<T>(res: Resource): Observable<T[]> {
    return this.http.get<T[]>(`${this.base}/${res}`);
  }

  create<T>(res: Resource, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}/${res}`, body);
  }

  update<T>(res: Resource, id: number, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.base}/${res}/${id}`, body);
  }

  remove(res: Resource, id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${res}/${id}`);
  }

  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${this.base}/dashboard`);
  }

  paiementsDuMois(mois: string): Observable<Paiement[]> {
    return this.http.get<Paiement[]>(`${this.base}/paiements/mois/${mois}`);
  }

  genererMois(mois: string): Observable<Paiement[]> {
    return this.http.post<Paiement[]>(`${this.base}/paiements/generer?mois=${mois}`, {});
  }

  payer(id: number): Observable<Paiement> {
    return this.http.post<Paiement>(`${this.base}/paiements/${id}/payer`, {});
  }
}
