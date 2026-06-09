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

// Instalação: Baixa tudo para o cache (à prova de falhas)
self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Em vez de addAll (que falha e cancela o PWA se faltar 1 arquivo), 
            // adicionamos um por um.
            for (let asset of ASSETS) {
                try {
                    await cache.add(asset);
                } catch (erro) {
                    console.error('Falha ao cachear o arquivo:', asset, erro);
                }
            }
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
