# Konfiguracja Azure Cosmos DB

Aplikacja łączy się z Cosmos DB (NoSQL API) bezpośrednio z przeglądarki, bez backendu.

## Układ danych
- Kontener **`catan`** (klucz partycji np. `/accountid`): jeden dokument na konto. `id` i `accountid` to hash SHA-256 z `"catan-noter:" + klucz konta` (sam klucz nie jest zapisywany). Aplikacja sama wykrywa nazwę bazy i pole klucza partycji.
- Kontener **`settings`** (klucz partycji `/id`), tworzony przez aplikację przy ustawianiu hasła admina: dokument `admin` (hash PBKDF2-SHA256 z solą) i dokument `counter` (numer następnego konta).

## Co zrobić w Azure
1. W koncie Cosmos: **Settings → CORS**, dodać `https://slowikowskiarkadiusz.github.io`.
2. Uwaga na koszty: nowy kontener w bazie bez współdzielonej przepustowości dostaje domyślnie własną przepustowość (zwykle min. 400 RU/s). Na koncie serverless albo w bazie ze współdzieloną przepustowością nie ma dodatkowego kosztu. Jeśli wolisz, załóż kontener `settings` ręcznie (klucz partycji `/id`) i ustaw przepustowość sam.

## Connection string
- **Nie wpisuj go do `cosmos-config.js` ani nigdzie w repo.** Strona jest publiczna, a klucz daje pełny dostęp do konta Cosmos.
- Na ekranie logowania, w sekcji „Połączenie z bazą”, wklej connection string. Zapisuje się tylko w localStorage tego urządzenia.

## Hasło admina
Przy pierwszym zakładaniu konta, gdy w bazie nie ma jeszcze hasła admina, aplikacja zapyta, czy wpisane hasło ustawić jako hasło admina. Potem każde nowe konto wymaga tego hasła.
