# Konfiguracja Azure Cosmos DB

Aplikacja łączy się z Cosmos DB (NoSQL API) bezpośrednio z przeglądarki, bez backendu.

## Co założyć w Azure
1. Konto Cosmos DB, API: **NoSQL**.
2. Baza `catan` i kontener `accounts` z kluczem partycji **`/id`** (nazwy można zmienić w `cosmos-config.js`).
3. W koncie: **Settings → CORS**, dodać `https://slowikowskiarkadiusz.github.io` (do testów lokalnych dodatkowo adres, z którego otwierasz stronę).

## Connection string
- **Nie wpisuj go do `cosmos-config.js` ani nigdzie w repo.** Strona jest publiczna, a klucz z connection stringa daje pełny dostęp do całego konta Cosmos (odczyt, zapis, usuwanie, koszty).
- Zostaw `connectionString: ''`. Na ekranie logowania, w sekcji „Połączenie z bazą”, wklej connection string. Zapisuje się tylko w localStorage tego urządzenia.

## Konta
- Każde konto to jeden dokument w kontenerze. `id` = SHA-256 z `"catan-noter:" + klucz konta` (sam klucz nie jest zapisywany).
- Numer konta pochodzi z licznika w dokumencie `meta`.
- Nowe konto wymaga klucza admina. Ustaw w `cosmos-config.js` pole `adminKeyHash` (SHA-256 hex klucza admina: `echo -n 'klucz' | shasum -a 256`). Puste = bez sprawdzania.

## Co jest w dokumencie konta
Ustawienia startowe, bieżąca gra (rzuty z czasami), wygrane i zbiorcze statystyki (sumy rzutów na gracza, sumy czasów ruchów). Surowa historia zakończonych gier nie jest przechowywana.
