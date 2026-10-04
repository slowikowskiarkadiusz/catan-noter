// Konfiguracja połączenia z Azure Cosmos DB (NoSQL API).
//
// connectionString: zostaw PUSTY. Ten plik jest publiczny (GitHub Pages), a klucz z connection stringa daje pełny dostęp
// do bazy. Bez wpisu tutaj aplikacja poprosi o connection string na ekranie logowania i zapisze go tylko na tym urządzeniu.
//
// adminKeyHash: SHA-256 (hex, małe litery) klucza admina wymaganego do zakładania kont.
//   Mac: echo -n 'klucz-admina' | shasum -a 256
// Puste = zakładanie kont bez sprawdzania klucza admina.
window.COSMOS_CONFIG = {
  connectionString: '',
  database: 'catan',
  container: 'accounts',   // klucz partycji: /id
  adminKeyHash: '',
};
