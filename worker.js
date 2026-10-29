// ==========================================
// SEMİH ALGAN - URL KISALTICI & ANALİTİK
// ==========================================

function randomStr(len = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let res = '';
  for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

function getDevice(ua = '') {
  if (/mobile/i.test(ua)) return 'Mobil';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  return 'Masaüstü';
}

function isBot(ua = '') {
  return /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegrambot|slackbot|twitterbot/i.test(ua);
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. ARAYÜZ (HTML)
    if (path === '/' || path === '/index.html') {
      return new Response(HTML_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 2. LİNK KISALTMA (short_links Tablosu)
    if (path === '/api/shorten' && request.method === 'POST') {
      try {
        const { long_url } = await request.json();
        let validUrl;
        try {
          validUrl = new URL(long_url);
          if (!['http:', 'https:'].includes(validUrl.protocol)) throw new Error();
        } catch {
          return json({ error: 'Geçersiz URL formatı.' }, 400);
        }

        const normalizedUrl = validUrl.toString();

        // Mükerrer kayıt kontrolü (Veritabanını şişirmez)
        const existing = await env.DB.prepare(
          'SELECT short_code, secret_key FROM short_links WHERE long_url = ?1'
        ).bind(normalizedUrl).first();

        if (existing) {
          return json({
            success: true,
            short_code: existing.short_code,
            short_url: `${url.origin}/${existing.short_code}`,
            secret_key: existing.secret_key,
          });
        }

        const shortCode = randomStr(6);
        const secretKey = randomStr(16);
        const now = Date.now();

        await env.DB.prepare(
          'INSERT INTO short_links (short_code, long_url, secret_key, created_at) VALUES (?1, ?2, ?3, ?4)'
        ).bind(shortCode, normalizedUrl, secretKey, now).run();

        return json({
          success: true,
          short_code: shortCode,
          short_url: `${url.origin}/${shortCode}`,
          secret_key: secretKey,
        }, 201);
      } catch (err) {
        return json({ error: 'Veritabanı bağlantı hatası.' }, 500);
      }
    }

    // 3. İSTATİSTİK SORGULAMA
    if (path.startsWith('/api/stats/') && request.method === 'GET') {
      const code = path.replace('/api/stats/', '').trim();
      const secret = url.searchParams.get('key');

      const link = await env.DB.prepare('SELECT * FROM short_links WHERE short_code = ?1').bind(code).first();
      if (!link) return json({ error: 'Link bulunamadı.' }, 404);
      if (link.secret_key !== secret) return json({ error: 'Geçersiz Gizli Anahtar!' }, 401);

      return json({
        short_code: link.short_code,
        long_url: link.long_url,
        total_clicks: link.clicks,
        countries: JSON.parse(link.countries || '{}'),
        devices: JSON.parse(link.devices || '{}'),
      });
    }

    // 4. EDGE YÖNLENDİRME (JSON Sayacı Güncelleme)
    if (path.length > 1 && !path.startsWith('/api/')) {
      const code = path.slice(1);
      const link = await env.DB.prepare(
        'SELECT long_url, countries, devices FROM short_links WHERE short_code = ?1'
      ).bind(code).first();

      if (link) {
        const ua = request.headers.get('user-agent') || '';

        // Bot kontrolü (botlar veritabanına yazmaz)
        if (!isBot(ua)) {
          ctx.waitUntil((async () => {
            const country = request.cf?.country || 'TR';
            const device = getDevice(ua);

            const cMap = JSON.parse(link.countries || '{}');
            const dMap = JSON.parse(link.devices || '{}');

            cMap[country] = (cMap[country] || 0) + 1;
            dMap[device] = (dMap[device] || 0) + 1;

            await env.DB.prepare(
              'UPDATE short_links SET clicks = clicks + 1, countries = ?1, devices = ?2 WHERE short_code = ?3'
            ).bind(JSON.stringify(cMap), JSON.stringify(dMap), code).run();
          })());
        }

        return Response.redirect(link.long_url, 302);
      }

      return Response.redirect(url.origin, 302);
    }

    return new Response('Sayfa bulunamadı', { status: 404 });
  },
};

// ==========================================
// ARAYÜZ (HTML - BEYAZ VE ÇAM YEŞİLİ TEMA)
// ==========================================
const HTML_PAGE = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>URL Kısaltıcı & İstatistik — Semih Algan</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: { 50: '#ecfdf5', 600: '#059669', 700: '#047857' }
      }
    }
  }
}
</script>
<style>
  body { background-color: #fbfcfc; color: #18181b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .panel-card { background: #ffffff; border: 1px solid #e4e4e7; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
</style>
</head>
<body class="min-h-screen flex flex-col antialiased">
  <header class="border-b border-zinc-200/80 bg-white/90 backdrop-blur sticky top-0 z-20">
    <div class="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
      <a href="https://semihalgan.com.tr" class="flex items-center gap-2 font-semibold text-lg text-zinc-900 group">
        <span class="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100 text-brand-600 border border-zinc-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>
          </svg>
        </span>
        <span>semih<span class="font-normal text-zinc-500">algan</span><span class="text-brand-600">.</span></span>
      </a>
      <a href="https://semihalgan.com.tr/yazilimlar" class="text-xs font-medium text-zinc-500 hover:text-zinc-900">← Yazılımlar</a>
    </div>
  </header>

  <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
    <div class="mb-6">
      <span class="text-xs font-bold uppercase tracking-wider text-brand-600">02 / ARAÇLAR</span>
      <h1 class="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">URL Kısaltıcı & Analitik<span class="text-brand-600">.</span></h1>
      <p class="mt-1 text-sm text-zinc-600">Hızlı, temiz ve gizlilik odaklı link kısaltma aracı.</p>
    </div>

    <div class="flex gap-2 border-b border-zinc-200 mb-6">
      <button id="tabShortenBtn" onclick="switchTab('shorten')" class="px-4 py-2 text-sm font-semibold border-b-2 border-brand-600 text-brand-600">Link Kısalt</button>
      <button id="tabStatsBtn" onclick="switchTab('stats')" class="px-4 py-2 text-sm font-medium text-zinc-500 border-b-2 border-transparent">İstatistikler</button>
    </div>

    <!-- KISALTMA SEKMESİ -->
    <div id="tabShorten" class="space-y-4">
      <div class="panel-card rounded-2xl p-5">
        <label class="block text-xs font-semibold uppercase text-zinc-500 mb-2">Uzun URL</label>
        <div class="flex flex-col sm:flex-row gap-3">
          <input id="longUrlInput" type="url" placeholder="https://..." class="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm outline-none focus:bg-white focus:border-brand-600">
          <button id="shortenBtn" onclick="shortenUrl()" class="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 text-sm transition">Kısalt</button>
        </div>
        <p id="shortenError" class="hidden mt-2 text-xs text-red-600 font-medium"></p>
      </div>

      <div id="resultCard" class="hidden panel-card rounded-2xl p-5 border-brand-200 bg-brand-50/40">
        <h3 class="text-sm font-bold text-brand-900 mb-3">✓ Linkiniz Hazır!</h3>
        <div class="flex gap-2 mb-3">
          <input id="shortResultUrl" readonly class="flex-1 rounded-lg border border-zinc-200 bg-white p-2.5 font-mono text-xs">
          <button onclick="copyToClipboard('shortResultUrl')" class="bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-medium">Kopyala</button>
          <button onclick="toggleQR()" class="bg-white border border-zinc-300 text-zinc-700 px-3 py-2 rounded-lg text-xs font-medium">QR</button>
        </div>
        <div id="qrBox" class="hidden mb-3 p-3 bg-white rounded-xl border border-zinc-200 flex flex-col items-center">
          <img id="qrImg" src="" alt="QR" class="w-28 h-28 mb-1">
        </div>
        <div class="rounded-xl bg-white border border-brand-200 p-3 text-xs text-zinc-600 space-y-1">
          <div class="font-bold text-zinc-800">🔒 Gizli İstatistik Anahtarınız:</div>
          <code id="secretKeyText" class="font-mono bg-zinc-100 px-2 py-1 rounded text-brand-700 font-semibold select-all block w-fit"></code>
          <button onclick="goToStatsFromKey()" class="text-xs font-semibold text-brand-600 underline pt-1 block">Bu linkin istatistiklerine git →</button>
        </div>
      </div>
    </div>

    <!-- İSTATİSTİK SEKMESİ -->
    <div id="tabStats" class="hidden space-y-4">
      <div class="panel-card rounded-2xl p-5">
        <div class="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label class="block text-xs font-semibold uppercase text-zinc-500 mb-1">Kısa Kod</label>
            <input id="statsCodeInput" placeholder="Örn: aB3xY9" class="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-sm outline-none focus:border-brand-600">
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-zinc-500 mb-1">Gizli Anahtar</label>
            <input id="statsKeyInput" placeholder="Gizli anahtarınız" class="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-sm outline-none focus:border-brand-600">
          </div>
        </div>
        <button onclick="fetchStats()" class="w-full rounded-xl bg-zinc-900 text-white font-semibold py-2.5 text-sm">Sorgula</button>
        <p id="statsError" class="hidden mt-2 text-xs text-red-600 font-medium"></p>
      </div>

      <div id="statsResult" class="hidden space-y-4">
        <div class="panel-card rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span class="text-xs font-semibold text-zinc-400 uppercase">Toplam Tıklanma</span>
            <div id="totalClicks" class="text-3xl font-extrabold text-brand-600">0</div>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div class="panel-card rounded-2xl p-4">
            <h4 class="text-xs font-bold text-zinc-500 uppercase mb-2">Ülkeler</h4>
            <ul id="countryList" class="space-y-1 text-xs text-zinc-700"></ul>
          </div>
          <div class="panel-card rounded-2xl p-4">
            <h4 class="text-xs font-bold text-zinc-500 uppercase mb-2">Cihazlar</h4>
            <ul id="deviceList" class="space-y-1 text-xs text-zinc-700"></ul>
          </div>
        </div>
      </div>
    </div>
  </main>

  <footer class="border-t border-zinc-200/70 bg-white py-6 text-center text-xs text-zinc-500">
    © 2026 Semih Algan · <a href="https://semihalgan.com.tr" class="hover:text-brand-600 underline">semihalgan.com.tr</a>
  </footer>

  <script>
    var currentCode = '', currentSecret = '';
    function switchTab(t) {
      var isS = t === 'shorten';
      document.getElementById('tabShorten').classList.toggle('hidden', !isS);
      document.getElementById('tabStats').classList.toggle('hidden', isS);
      document.getElementById('tabShortenBtn').className = isS ? 'px-4 py-2 text-sm font-semibold border-b-2 border-brand-600 text-brand-600' : 'px-4 py-2 text-sm font-medium text-zinc-500 border-b-2 border-transparent';
      document.getElementById('tabStatsBtn').className = !isS ? 'px-4 py-2 text-sm font-semibold border-b-2 border-brand-600 text-brand-600' : 'px-4 py-2 text-sm font-medium text-zinc-500 border-b-2 border-transparent';
    }
    async function shortenUrl() {
      var input = document.getElementById('longUrlInput');
      var err = document.getElementById('shortenError');
      var btn = document.getElementById('shortenBtn');
      err.classList.add('hidden');
      if (!input.value.trim()) { err.textContent = 'Lütfen geçerli bir URL girin.'; err.classList.remove('hidden'); return; }
      btn.disabled = true; btn.textContent = '...';
      try {
        var res = await fetch('/api/shorten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ long_url: input.value.trim() }) });
        var d = await res.json();
        if (!res.ok) throw new Error(d.error);
        currentCode = d.short_code; currentSecret = d.secret_key;
        document.getElementById('shortResultUrl').value = d.short_url;
        document.getElementById('secretKeyText').textContent = d.secret_key;
        document.getElementById('qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(d.short_url);
        document.getElementById('resultCard').classList.remove('hidden');
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
      finally { btn.disabled = false; btn.textContent = 'Kısalt'; }
    }
    function toggleQR() { document.getElementById('qrBox').classList.toggle('hidden'); }
    function copyToClipboard(id) { var el = document.getElementById(id); navigator.clipboard.writeText(el.value); alert('Kopyalandı!'); }
    function goToStatsFromKey() { switchTab('stats'); document.getElementById('statsCodeInput').value = currentCode; document.getElementById('statsKeyInput').value = currentSecret; fetchStats(); }
    async function fetchStats() {
      var c = document.getElementById('statsCodeInput').value.trim();
      var k = document.getElementById('statsKeyInput').value.trim();
      var err = document.getElementById('statsError');
      var box = document.getElementById('statsResult');
      err.classList.add('hidden');
      if (!c || !k) { err.textContent = 'Kod ve Gizli Anahtar zorunludur.'; err.classList.remove('hidden'); return; }
      try {
        var res = await fetch('/api/stats/' + encodeURIComponent(c) + '?key=' + encodeURIComponent(k));
        var d = await res.json();
        if (!res.ok) throw new Error(d.error);
        document.getElementById('totalClicks').textContent = d.total_clicks;
        var cList = document.getElementById('countryList');
        var cKeys = Object.keys(d.countries);
        cList.innerHTML = cKeys.length ? cKeys.map(function(x){ return '<li class="flex justify-between border-b pb-1"><span>🌍 ' + x + '</span><b>' + d.countries[x] + ' tık</b></li>'; }).join('') : '<li class="text-zinc-400">Veri yok</li>';
        var dList = document.getElementById('deviceList');
        var dKeys = Object.keys(d.devices);
        dList.innerHTML = dKeys.length ? dKeys.map(function(x){ return '<li class="flex justify-between border-b pb-1"><span>💻 ' + x + '</span><b>' + d.devices[x] + ' tık</b></li>'; }).join('') : '<li class="text-zinc-400">Veri yok</li>';
        box.classList.remove('hidden');
      } catch(e) { err.textContent = e.message; err.classList.remove('hidden'); box.classList.add('hidden'); }
    }
  </script>
</body>
</html>`;
