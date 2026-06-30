const CACHE_NAME = 'geo-univille-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './dados/blocos_univille1.geojson',
    './dados/salas_univille.geojson',
    './dados/RUAS.geojson',
    './dados/BIBLIOTECA.geojson',
    './dados/CANTINAS.geojson',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Instalação: Baixa tudo para o cache
self.addEventListener('install', (evento) => {
    self.skipWaiting(); // Força a instalação imediata
    evento.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Ativação: Limpa caches velhos se atualizarmos a versão (v2, v3)
self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys().then((nomesCaches) => {
            return Promise.all(
                nomesCaches.map((nome) => {
                    if (nome !== CACHE_NAME) {
                        return caches.delete(nome);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim(); // Assume o controle das páginas abertas imediatamente
        })
    );
});

// Intercepta as requisições (Offline support)
self.addEventListener('fetch', (evento) => {
    evento.respondWith(
        caches.match(evento.request).then((respostaCache) => {
            // Retorna do cache se encontrar, senão vai para a internet
            return respostaCache || fetch(evento.request).catch(() => {
                // Se falhar e for imagem, ou outra coisa, podemos retornar algo padrão
                // Como nossos mapas base do Google/OSM dependem da internet, eles não carregarão,
                // mas os blocos e salas do nosso geojson (cacheados) vão aparecer na tela cinza!
            });
        })
    );
});
