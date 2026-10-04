// Konfiguracja połączenia z Azure Cosmos DB (NoSQL API).
//
// connectionString: zostaw PUSTY. Ten plik jest publiczny (GitHub Pages), a klucz z connection stringa daje pełny dostęp
// do bazy. Bez wpisu tutaj aplikacja poprosi o connection string na ekranie logowania i zapisze go tylko na tym urządzeniu.
window.COSMOS_CONFIG = {
  connectionString: '',
  database: '',                  // puste = aplikacja sama znajdzie bazę, w której jest kontener "container"
  container: 'catan',            // konta i statystyki, klucz partycji np. /accountid
  settingsContainer: 'settings', // hasło admina (hash) i licznik numerów kont, klucz partycji /id
};
