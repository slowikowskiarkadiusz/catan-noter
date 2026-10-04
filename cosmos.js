// Klient Azure Cosmos DB (NoSQL / SQL API) działający bezpośrednio z przeglądarki, bez backendu.
// Podpisuje żądania kluczem z connection stringa (HMAC-SHA256), więc klucz musi być dostępny w przeglądarce.
// UWAGA: kto zna ten klucz, ma pełny dostęp do całego konta Cosmos. Nie commituj go do publicznego repo.
(function () {
  const enc = new TextEncoder();
  const API_VERSION = '2018-12-31';

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

  // cfg: { connectionString, database, container, adminKeyHash }
  function connect(cfg) {
    const { endpoint, key } = parseConnectionString(cfg.connectionString);
    const db = cfg.database || 'catan';
    const coll = cfg.container || 'accounts';
    const collLink = `dbs/${db}/colls/${coll}`;
    let hmacKey = null;

    async function request(method, resourceLink, path, opts = {}) {
      if (!hmacKey) hmacKey = await crypto.subtle.importKey('raw', b64ToBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const date = new Date().toUTCString();
      // verb \n resourceType \n resourceLink \n date \n (puste) \n  — verb, typ i data małymi literami
      const text = `${method.toLowerCase()}\ndocs\n${resourceLink}\n${date.toLowerCase()}\n\n`;
      const sig = bytesToB64(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(text)));
      const headers = {
        'Authorization': encodeURIComponent(`type=master&ver=1.0&sig=${sig}`),
        'x-ms-date': date,
        'x-ms-version': API_VERSION,
        'Accept': 'application/json',
        ...(opts.partition ? { 'x-ms-documentdb-partitionkey': JSON.stringify([opts.partition]) } : {}),
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

    const docLink = id => `${collLink}/docs/${id}`;
    const getDoc = id => request('GET', docLink(id), docLink(id), { partition: id, allow404: true });
    const createDoc = doc => request('POST', collLink, `${collLink}/docs`, { partition: doc.id, body: strip(doc) });
    const replaceDoc = (doc, etag) => request('PUT', docLink(doc.id), docLink(doc.id), { partition: doc.id, body: strip(doc), ifMatch: etag });

    const accountId = secret => sha256Hex('catan-noter:' + secret);

    return {
      hashKey: accountId,

      // zwraca dokument konta albo null, jeśli takie konto nie istnieje
      getAccount: id => getDoc(id),

      // zapis dokumentu konta z kontrolą współbieżności (ETag); przy konflikcie rzuca CosmosError(412)
      saveAccount: doc => replaceDoc({ ...doc, updatedAt: new Date().toISOString() }, doc._etag),

      // nowe konto: numer przydzielany z licznika w dokumencie "meta"
      async createAccount(secret, adminSecret) {
        const want = cfg.adminKeyHash;
        if (want && (await sha256Hex(adminSecret || '')) !== String(want).toLowerCase()) throw new CosmosError(403, 'Nieprawidłowy klucz admina');
        const id = await accountId(secret);
        if (await getDoc(id)) throw new CosmosError(409, 'Konto z takim kluczem już istnieje');

        let number = null;
        for (let attempt = 0; attempt < 4 && number === null; attempt++) {
          let meta = await getDoc('meta');
          if (!meta) {
            try { meta = await createDoc({ id: 'meta', type: 'meta', nextNumber: 1 }); }
            catch (e) { if (e.status === 409) continue; throw e; }
          }
          try {
            await replaceDoc({ ...meta, nextNumber: (meta.nextNumber || 1) + 1 }, meta._etag);
            number = meta.nextNumber || 1;
          } catch (e) { if (e.status !== 412) throw e; }   // ktoś inny właśnie założył konto, próbujemy jeszcze raz
        }
        if (number === null) throw new CosmosError(409, 'Nie udało się przydzielić numeru konta, spróbuj ponownie');

        return createDoc({
          id, type: 'account', schema: 1, number, createdAt: new Date().toISOString(),
          setup: null, game: null, wins: {}, stats: { games: 0, players: {} },
        });
      },
    };
  }

  window.Cosmos = { connect, parseConnectionString, sha256Hex, CosmosError };
})();
