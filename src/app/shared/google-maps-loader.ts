import { environment } from '../core/config/environment';

let loadPromise: Promise<void> | null = null;

/** Carga el script de Google Maps JS API una sola vez y la comparte entre todos los mapas de la página (location-map). */
function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export { loadGoogleMaps };
