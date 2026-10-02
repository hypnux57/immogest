/** Géocodage des adresses françaises via le service public de l'IGN (Géoplateforme), sans clé. */
export interface Position { lat: number; lng: number; libelle: string; }

export async function geocoder(adresse: string, codePostal: string, ville: string): Promise<Position | null> {
  const q = [adresse, codePostal, ville].map((x) => (x || '').trim()).filter(Boolean).join(' ');
  if (q.length < 5) return null;
  try {
    const params = new URLSearchParams({ q, limit: '1' });
    if (/^\d{5}$/.test((codePostal || '').trim())) params.set('postcode', codePostal.trim());
    const r = await fetch(`https://data.geopf.fr/geocodage/search?${params}`);
    if (!r.ok) return null;
    const json = await r.json();
    const f = json?.features?.[0];
    if (!f || (f.properties?.score ?? 0) < 0.4) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { lat, lng, libelle: f.properties.label };
  } catch {
    return null;
  }
}
