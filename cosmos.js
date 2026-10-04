// Klient Azure Cosmos DB (NoSQL / SQL API) działający bezpośrednio z przeglądarki, bez backendu.
// Podpisuje żądania kluczem z connection stringa (HMAC-SHA256), więc klucz musi być dostępny w przeglądarce.
// UWAGA: kto zna ten klucz, ma pełny dostęp do całego konta Cosmos. Nie commituj go do publicznego repo.
//
// Układ danych:
//   kontener "catan" (klucz partycji np. /accountid), w nim osobne dokumenty:
//     konto:   id = accountid = hash klucza konta
//     "admin": hash hasła admina
//     "counter": numer następnego konta
(function () {
  const enc = new TextEncoder();
  const API_VERSION = '2018-12-31';
  const ADMIN_ITERATIONS = 100000;

  const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bytesToB64 = buf => {
    let s = '';
    new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
    return btoa(s);
  };
  async function sha256Hex(text) {
    const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // hasło admina: PBKDF2-SHA256 z losową solą (NFC, żeby „ń” z różnych klawiatur dawało ten sam hash)
  async function pbkdf2(password, saltBytes, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, base, 256);
    return bytesToB64(bits);
  }

  // "AccountEndpoint=https://x.documents.azure.com:443/;AccountKey=abc==;" -> { endpoint, key }
  function parseConnectionString(cs) {
    const o = {};
    String(cs || '').split(';').forEach(part => {
      const i = part.indexOf('=');  // klucz Base64 może zawierać '=' na końcu, więc dzielimy tylko po pierwszym
      if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
    if (!o.AccountEndpoint || !o.AccountKey) throw new Error('Nieprawidłowy connection string (brak AccountEndpoint lub AccountKey)');
    return { endpoint: o.AccountEndpoint.replace(/\/+$/, ''), key: o.AccountKey };
  }

  class CosmosError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  // Dokument bez pól systemowych Cosmosa (_rid, _self, _etag, _ts, ...)
  const strip = doc => Object.fromEntries(Object.entries(doc).filter(([k]) => !k.startsWith('_')));

  // cfg: { connectionString, database ('' = wykryj), container }
  function connect(cfg) {
    const { endpoint, key } = parseConnectionString(cfg.connectionString);
    const container = cfg.container || 'catan';
    let hmacKey = null;
    let ready = null;   // { db, pkProp } po wykryciu bazy i klucza partycji

    // resourceType: dbs | colls | docs; resourceLink: np. "dbs/x/colls/y/docs/z" (puste dla listy baz)
    async function request(method, resourceType, resourceLink, path, opts = {}) {
      if (!hmacKey) hmacKey = await crypto.subtle.importKey('raw', b64ToBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const date = new Date().toUTCString();
      // verb \n resourceType \n resourceLink \n date \n (puste) \n  — verb, typ i data małymi literami
      const text = `${method.toLowerCase()}\n${resourceType}\n${resourceLink}\n${date.toLowerCase()}\n\n`;
      const sig = bytesToB64(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(text)));
      const headers = {
        'Authorization': encodeURIComponent(`type=master&ver=1.0&sig=${sig}`),
        'x-ms-date': date,
        'x-ms-version': API_VERSION,
        'Accept': 'application/json',
        ...(opts.partition !== undefined ? { 'x-ms-documentdb-partitionkey': JSON.stringify([opts.partition]) } : {}),
        ...(opts.ifMatch ? { 'If-Match': opts.ifMatch } : {}),
      };
      let body;
      if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
      let res;
      try {
        res = await fetch(`${endpoint}/${path}`, { method, headers, body });
      } catch (e) {
        throw new CosmosError(0, 'Brak połączenia z bazą (sieć, adres lub CORS)');
      }
      if (res.status === 404 && opts.allow404) return null;
      if (!res.ok) {
        let msg = '';
        try { msg = (await res.json()).message || ''; } catch (e) {}
        throw new CosmosError(res.status, `Cosmos DB ${res.status}${msg ? ': ' + msg.split('\n')[0] : ''}`);
      }
      return res.json();
    }

    // ---- baza i kontenery ----
    const collLink = (db, c) => `dbs/${db}/colls/${c}`;
    const pkPropOf = coll => {
      const path = coll && coll.partitionKey && coll.partitionKey.paths && coll.partitionKey.paths[0];
      if (!path || !/^\/[A-Za-z0-9_]+$/.test(path)) throw new CosmosError(400, `Nieobsługiwany klucz partycji kontenera „${container}”: ${path}`);
      return path.slice(1);
    };

    async function init() {
      if (ready) return ready;
      if (cfg.database) {
        const coll = await request('GET', 'colls', collLink(cfg.database, container), collLink(cfg.database, container), { allow404: true });
        if (!coll) throw new CosmosError(404, `Nie znaleziono kontenera „${container}” w bazie „${cfg.database}”`);
        return (ready = { db: cfg.database, pkProp: pkPropOf(coll) });
      }
      // brak nazwy bazy w konfiguracji: szukamy bazy, która ma kontener o tej nazwie
      const dbs = (await request('GET', 'dbs', '', 'dbs')).Databases || [];
      for (const d of dbs) {
        const colls = (await request('GET', 'colls', `dbs/${d.id}`, `dbs/${d.id}/colls`)).DocumentCollections || [];
        const hit = colls.find(c => c.id === container);
        if (hit) return (ready = { db: d.id, pkProp: pkPropOf(hit) });
      }
      throw new CosmosError(404, `Nie znaleziono kontenera „${container}” (bazy na koncie: ${dbs.map(d => d.id).join(', ') || 'brak'})`);
    }

    // operacje na dokumentach w wybranym kontenerze; pk = nazwa pola klucza partycji
    function docOps(containerName, pkPropFn) {
      const link = async id => { const { db } = await init(); return `${collLink(db, containerName)}/docs/${id}`; };
      const withPk = async doc => { const p = await pkPropFn(); return p === 'id' ? doc : { ...doc, [p]: doc.id }; };
      return {
        async get(id) { const l = await link(id); return request('GET', 'docs', l, l, { partition: id, allow404: true }); },
        async create(doc) {
          const { db } = await init();
          const d = await withPk(strip(doc));
          return request('POST', 'docs', collLink(db, containerName), `${collLink(db, containerName)}/docs`, { partition: doc.id, body: d });
        },
        async replace(doc, etag) {
          const l = await link(doc.id);
          return request('PUT', 'docs', l, l, { partition: doc.id, body: await withPk(strip(doc)), ifMatch: etag });
        },
      };
    }
    // konta, hasło admina i licznik leżą w jednym kontenerze (osobne dokumenty, accountid = id)
    const accounts = docOps(container, async () => (await init()).pkProp);
    const settings = accounts;

    // ---- hasło admina ----
    async function setAdminPassword(password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const doc = {
        id: 'admin', type: 'admin', algo: 'PBKDF2-SHA256', iterations: ADMIN_ITERATIONS,
        salt: bytesToB64(salt), hash: await pbkdf2(password, salt, ADMIN_ITERATIONS),
      };
      try { await settings.create(doc); }
      catch (e) { if (e.status === 409) throw new CosmosError(409, 'Hasło admina zostało w międzyczasie ustawione. Spróbuj ponownie.'); throw e; }
    }
    async function checkAdminPassword(admin, password) {
      return (await pbkdf2(password, b64ToBytes(admin.salt), admin.iterations)) === admin.hash;
    }

    return {
      hashKey: secret => sha256Hex('catan-noter:' + secret),

      // zwraca dokument konta albo null, jeśli takie konto nie istnieje
      getAccount: async id => accounts.get(id),

      // zapis dokumentu konta z kontrolą współbieżności (ETag); przy konflikcie rzuca CosmosError(412)
      saveAccount: doc => accounts.replace({ ...doc, updatedAt: new Date().toISOString() }, doc._etag),

      // Nowe konto. Hash hasła admina jest w dokumencie "admin". Jeśli go jeszcze nie ma (pierwsze uruchomienie),
      // po potwierdzeniu (confirmSetup) wpisane hasło zostaje hasłem admina.
      async createAccount(secret, adminSecret, confirmSetup) {
        if (!adminSecret) throw new CosmosError(403, 'Podaj klucz admina');
        const admin = await settings.get('admin');   // null, gdy dokumentu jeszcze nie ma
        if (!admin) {
          if (!confirmSetup || !(await confirmSetup())) throw new CosmosError(403, 'Anulowano');
          await setAdminPassword(adminSecret);
        } else if (!(await checkAdminPassword(admin, adminSecret))) {
          throw new CosmosError(403, 'Nieprawidłowy klucz admina');
        }

        const id = await sha256Hex('catan-noter:' + secret);
        if (await accounts.get(id)) throw new CosmosError(409, 'Konto z takim kluczem już istnieje');

        // numer konta z dokumentu "counter" (ETag chroni przed jednoczesnym zakładaniem kont)
        let number = null;
        for (let attempt = 0; attempt < 4 && number === null; attempt++) {
          let counter = await settings.get('counter');
          if (!counter) {
            try { counter = await settings.create({ id: 'counter', type: 'counter', nextNumber: 1 }); }
            catch (e) { if (e.status === 409) continue; throw e; }
          }
          try {
            await settings.replace({ ...counter, nextNumber: (counter.nextNumber || 1) + 1 }, counter._etag);
            number = counter.nextNumber || 1;
          } catch (e) { if (e.status !== 412) throw e; }   // ktoś inny właśnie założył konto, próbujemy jeszcze raz
        }
        if (number === null) throw new CosmosError(409, 'Nie udało się przydzielić numeru konta, spróbuj ponownie');

        return accounts.create({
          id, type: 'account', schema: 1, number, createdAt: new Date().toISOString(),
          setup: null, game: null, wins: {}, stats: { games: 0, players: {} },
        });
      },
    };
  }

  window.Cosmos = { connect, parseConnectionString, sha256Hex, CosmosError };
})();
