# Konfiguracja Azure Cosmos DB

Aplikacja łączy się z Cosmos DB (NoSQL API) bezpośrednio z przeglądarki, bez backendu.

## Układ danych
Wszystko jest w jednym kontenerze **`catan`** (klucz partycji np. `/accountid`), w osobnych dokumentach:
- konto: `id` i `accountid` to hash SHA-256 z `"catan-noter:" + klucz konta` (sam klucz nie jest zapisywany),
- `admin`: hash hasła admina (PBKDF2-SHA256 z solą),
- `counter`: numer następnego konta.
Aplikacja sama wykrywa nazwę bazy i pole klucza partycji.

## Co zrobić w Azure
1. W koncie Cosmos: **Settings → CORS**, dodać `https://slowikowskiarkadiusz.github.io`.

## Connection string
Opcja 1: stała `COSMOS_CONNECTION_STRING` na górze pliku `cosmos-config.js` (wpisany na stałe; plik jest publiczny, więc klucz też, i po zregenerowaniu klucza trzeba go podmienić).
Opcja 2: zostaw ją pustą. Wtedy na ekranie logowania, w sekcji „Połączenie z bazą”, wklejasz connection string, a on zapisuje się tylko na tym urządzeniu.

## Hasło admina
Przy pierwszym zakładaniu konta, gdy w bazie nie ma jeszcze hasła admina, aplikacja zapyta, czy wpisane hasło ustawić jako hasło admina. Potem każde nowe konto wymaga tego hasła.

## Co trafia do bazy, a co zostaje lokalnie
- **Lokalnie (localStorage, osobno dla każdego konta na urządzeniu):** przebieg trwającej gry i ustawienia startowe. Trwająca gra nie jest widoczna na innych urządzeniach.
- **Do bazy, po zakończeniu gry (KONIEC):** wygrane, zbiorcze statystyki (sumy rzutów na gracza, sumy czasów ruchów) i ostatnie ustawienia startowe. Surowa historia zakończonych gier nie jest przechowywana.
- Jeśli zapis do bazy się nie uda (brak sieci), zmiany czekają lokalnie i są wysyłane przy następnym otwarciu aplikacji.

