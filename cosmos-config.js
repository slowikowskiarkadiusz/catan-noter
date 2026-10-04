// Konfiguracja połączenia z Azure Cosmos DB (NoSQL API).
//
// Tu wpisz connection string, w cudzysłowie, w jednej linii:
//   AccountEndpoint=https://...documents.azure.com:443/;AccountKey=...;
// UWAGA: ten plik jest publiczny (repo i GitHub Pages), więc każdy, kto go zobaczy, ma pełny dostęp do konta Cosmos DB.
// Po zregenerowaniu klucza w Azure trzeba tu wpisać nowy. Zostaw '' (puste), żeby aplikacja pytała o connection string
// na ekranie logowania i zapisywała go tylko na danym urządzeniu.
const COSMOS_CONNECTION_STRING = "AccountEndpoint=https://games-stats.documents.azure.com:443/;AccountKey=99hzhsDhVUTnTfx5bLRbY3FP3uUaWaPyCt6ftctdtg3QdhMAVOGKADBFcTzWlnosjybKC9GGbFOnACDbkZL9sg==;";

window.COSMOS_CONFIG = {
  connectionString: COSMOS_CONNECTION_STRING,
  database: '',                  // puste = aplikacja sama znajdzie bazę, w której jest kontener "container"
  container: 'catan',            // konta i statystyki, klucz partycji np. /accountid
  settingsContainer: 'settings', // hasło admina (hash) i licznik numerów kont, klucz partycji /id
};
