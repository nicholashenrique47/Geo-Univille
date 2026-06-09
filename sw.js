const CACHE_NAME = 'geo-univille-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './dados_geojson/blocos_univille1.geojson',
    './dados_geojson/salas_univille.geojson',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Instalação: Baixa tudo para o cache
self.addEventListener('install', (evento) => {
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
