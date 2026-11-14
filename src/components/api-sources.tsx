export function ApiSources() {
  return (
    <details className="api-sources app-api-sources">
      <summary>Sources &amp; APIs used</summary>
      <ul>
        <li>
          <a
            href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/"
            target="_blank"
            rel="noreferrer"
          >
            NASA POWER
          </a>{" "}
          — historical daily rainfall and temperature; not real-time weather.
        </li>
        <li>
          <a href="https://github.com/komoot/photon" target="_blank" rel="noreferrer">
            Photon / OpenStreetMap
          </a>{" "}
          — municipality/city lookup.
        </li>
        <li>
          <a
            href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html"
            target="_blank"
            rel="noreferrer"
          >
            ISRIC SoilGrids
          </a>{" "}
          — predicted soil pH and texture; 250 m grid, 5–15 cm depth.
        </li>
        <li>
          <a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noreferrer">
            Open-Meteo / Copernicus GLO-90
          </a>{" "}
          — elevation samples; approximate terrain gradient, not measured drainage. Free endpoint
          for non-commercial use.
        </li>
        <li>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>{" "}
          — map tiles;{" "}
          <a href="https://leafletjs.com/" target="_blank" rel="noreferrer">
            Leaflet
          </a>{" "}
          renders the map.
        </li>
      </ul>
      <p>
        Exact request URLs and retrieval dates are available beside the relevant records. Drainage
        screening and crop scores use unvalidated demo rules. Irrigation requires farmer
        confirmation. NOAA and AI services are not connected.
      </p>
    </details>
  );
}
