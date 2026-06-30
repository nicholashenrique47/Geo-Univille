// ==========================================
// 1. INICIALIZAÇÃO DO MAPA E MAPAS BASE
// ==========================================
const map = L.map('map').setView([-26.2503, -48.8559], 19);

const camadaRua = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    attribution: '© OpenStreetMap'
});

const camadaSateliteEsri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    attribution: '© Esri'
});

const camadaSateliteGoogle = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 22,
    attribution: '© Google'
});

camadaSateliteGoogle.addTo(map);

// ==========================================
// 2. CRIAÇÃO DE GRUPOS E PAINEL RESPONSIVO (A MÁGICA DO ZOOM)
// ==========================================
// Criamos uma camada invisível apenas para segurar os textos
map.createPane('paneRotulosSalas');
map.getPane('paneRotulosSalas').style.pointerEvents = 'none'; // Clique atravessa o texto
map.getPane('paneRotulosSalas').style.zIndex = 650; // Fica acima dos polígonos
map.getPane('paneRotulosSalas').style.transition = 'opacity 0.3s ease'; // Animação suave ao sumir

const grupoBlocos = L.featureGroup().addTo(map);
const grupoSalas = L.featureGroup().addTo(map);
const grupoBanheiros = L.featureGroup().addTo(map);
const grupoRuas = L.featureGroup().addTo(map);
const grupoBiblioteca = L.featureGroup().addTo(map);
const grupoCantinas = L.featureGroup().addTo(map);

const controleCamadas = L.control.layers(
    {
        "Satélite (Google)": camadaSateliteGoogle,
        "Satélite (Esri)": camadaSateliteEsri,
        "Mapa de Ruas": camadaRua
    },
    {
        "🏢 Blocos": grupoBlocos,
        "🚪 Salas e Labs": grupoSalas,
        "🚻 Banheiros": grupoBanheiros,
        "🛣️ Ruas": grupoRuas,
        "📚 Biblioteca": grupoBiblioteca,
        "🍔 Cantinas": grupoCantinas
    },
    { collapsed: false }
).addTo(map);

// ==========================================
// 3. FUNÇÕES AUXILIARES
// ==========================================
function obterCorPorTipo(tipo) {
    switch (tipo) {
        case 'LAB': return '#00d2ff';
        case 'Sala de Aula': return '#28a745';
        case 'Sanitário': return '#ffc107';
        default: return '#cccccc';
    }
}

// Lógica de Zoom: Checa se estamos muito longe para esconder os textos
function gerenciarZoom() {
    const painelTextos = map.getPane('paneRotulosSalas');
    if (map.getZoom() >= 20) {
        painelTextos.style.opacity = '1';
        painelTextos.style.visibility = 'visible';
    } else {
        // Abaixo do zoom 20, os textos desaparecem suavemente
        painelTextos.style.opacity = '0';
        // Pequeno atraso para a visibilidade não cortar a animação de opacidade
        setTimeout(() => { if (map.getZoom() < 20) painelTextos.style.visibility = 'hidden'; }, 300);
    }
}

// Ativa a verificação toda vez que o mapa der zoom
map.on('zoomend', gerenciarZoom);

// ==========================================
// 3.5 GRAFO PARA ROTEAMENTO DE RUAS
// ==========================================
class GrafoRotas {
    constructor(geojsonRotas) {
        this.adj = new Map();
        geojsonRotas.features.forEach(feat => {
            let lines = [];
            if (feat.geometry.type === 'LineString') {
                lines = [feat.geometry.coordinates];
            } else if (feat.geometry.type === 'MultiLineString') {
                lines = feat.geometry.coordinates;
            }
            lines.forEach(coords => {
                for (let i = 0; i < coords.length - 1; i++) {
                    const p1 = this.getOrCreateNode(coords[i][0], coords[i][1]);
                    const p2 = this.getOrCreateNode(coords[i + 1][0], coords[i + 1][1]);
                    if (p1 !== p2) {
                        const [lng1, lat1] = p1.split(',').map(Number);
                        const [lng2, lat2] = p2.split(',').map(Number);
                        const dist = map.distance([lat1, lng1], [lat2, lng2]);
                        this.addAresta(p1, p2, dist);
                    }
                }
            });
        });
    }

    getOrCreateNode(lng, lat) {
        for (let noStr of this.adj.keys()) {
            const [lngNo, latNo] = noStr.split(',').map(Number);
            const dist = map.distance([lat, lng], [latNo, lngNo]);
            if (dist < 40) { // Tolerância aumentada para 40 metros
                return noStr;
            }
        }
        const noStr = lng.toFixed(6) + ',' + lat.toFixed(6);
        this.adj.set(noStr, []);
        return noStr;
    }

    addAresta(p1, p2, peso) {
        if (!this.adj.has(p1)) this.adj.set(p1, []);
        if (!this.adj.has(p2)) this.adj.set(p2, []);
        const p1Arestas = this.adj.get(p1);
        if (!p1Arestas.find(e => e.no === p2)) p1Arestas.push({ no: p2, peso: peso });
        const p2Arestas = this.adj.get(p2);
        if (!p2Arestas.find(e => e.no === p1)) p2Arestas.push({ no: p1, peso: peso });
    }

    encontrarNoMaisProximo(lat, lng) {
        let menorDist = Infinity;
        let noMaisProximo = null;
        for (let noStr of this.adj.keys()) {
            const [lngNo, latNo] = noStr.split(',').map(Number);
            const dist = map.distance([lat, lng], [latNo, lngNo]);
            if (dist < menorDist) {
                menorDist = dist;
                noMaisProximo = noStr;
            }
        }
        return noMaisProximo;
    }

    encontrarCaminhoMaisCurto(inicio, fim) {
        const distancias = new Map();
        const anteriores = new Map();
        const naoVisitados = new Set(this.adj.keys());

        for (let no of this.adj.keys()) {
            distancias.set(no, Infinity);
        }
        distancias.set(inicio, 0);

        while (naoVisitados.size > 0) {
            let u = null;
            for (let no of naoVisitados) {
                if (u === null || distancias.get(no) < distancias.get(u)) {
                    u = no;
                }
            }

            if (distancias.get(u) === Infinity || u === fim) {
                break;
            }

            naoVisitados.delete(u);

            for (let vizinho of this.adj.get(u)) {
                let alt = distancias.get(u) + vizinho.peso;
                if (alt < distancias.get(vizinho.no)) {
                    distancias.set(vizinho.no, alt);
                    anteriores.set(vizinho.no, u);
                }
            }
        }

        const caminho = [];
        let u = fim;
        if (anteriores.has(u) || u === inicio) {
            while (u) {
                caminho.unshift(u);
                u = anteriores.get(u);
            }
        }
        return caminho.map(c => {
            const [lng, lat] = c.split(',').map(Number);
            return [lat, lng];
        });
    }
}

// ==========================================
// 4. CARREGAMENTO DOS DADOS E APLICAÇÃO DOS ÍCONES
// ==========================================
Promise.all([
    fetch('./dados/blocos_univille1.geojson').then(res => res.json()),
    fetch('./dados/salas_univille.geojson').then(res => res.json()),
    fetch('./dados/RUAS.geojson').then(res => res.json()),
    fetch('./dados/BIBLIOTECA.geojson').then(res => res.json()),
    fetch('./dados/CANTINAS.geojson').then(res => res.json())
])
    .then(([blocos, salas, ruas, biblioteca, cantinas]) => {

        // --- DESENHANDO OS BLOCOS ---
        L.geoJSON(blocos, {
            style: { color: "#ffffff", weight: 3, fillColor: "#0000001e", fillOpacity: 0.2 },
            onEachFeature: function (feature, layer) {
                const idBloco = feature.properties.Id_Bloco || feature.properties.ID_BLOCO || feature.properties.id_bloco || "Indefinido";
                layer.bindPopup(`<b>Bloco ${idBloco}</b>`);
            }
        }).addTo(grupoBlocos);

        const apenasSalas = { type: "FeatureCollection", features: salas.features.filter(f => f.properties.tipo !== 'Sanitário') };
        const apenasBanheiros = { type: "FeatureCollection", features: salas.features.filter(f => f.properties.tipo === 'Sanitário') };

        const configVisual = {
            style: function (feature) {
                return {
                    color: obterCorPorTipo(feature.properties.tipo),
                    weight: 1,
                    fillColor: obterCorPorTipo(feature.properties.tipo),
                    fillOpacity: 0.2
                };
            },
            onEachFeature: function (feature, layer) {

                // LÓGICA DO ÍCONE VS TEXTO
                let conteudoRotulo = feature.properties.nome;
                let classeCSS = "rotulo-sala";

                if (feature.properties.tipo === 'Sanitário') {
                    conteudoRotulo = "🚻"; // Troca o nome pelo Emoji
                    classeCSS = "rotulo-sala rotulo-banheiro"; // Adiciona a classe extra para ficar grande
                }

                if (conteudoRotulo) {
                    layer.bindTooltip(conteudoRotulo, {
                        permanent: true,
                        direction: "center",
                        className: classeCSS,
                        pane: 'paneRotulosSalas' // AMARRA O TEXTO AO PAINEL QUE SOME NO ZOOM!
                    });
                }

                layer.on('add', function () {
                    const centro = layer.getBounds().getCenter();
                    const nome = feature.properties.nome || "Sala";
                    const htmlPopup = `
                    <div style="text-align: center; font-family: Arial;">
                        <h3 style="margin: 0 0 5px 0; color: #12472b;">${nome}</h3>
                        <hr style="border: 1px solid #eee;">
                        <b>Bloco:</b> ${feature.properties.fk_bloco}<br>
                        <b>Andar:</b> ${feature.properties.andar}<br>
                        <b>Tipo:</b> ${feature.properties.tipo}
                        <button class="btn-rota" style="margin-top:10px;" onclick="window.tracarRota(${centro.lat}, ${centro.lng}, '${nome}')">📍 Como Chegar</button>
                    </div>
                `;
                    layer.bindPopup(htmlPopup);
                });
            }
        };

        // Salvar globalmente para o filtro de andares
        window.salasOriginais = salas;
        window.configVisual = configVisual;

        L.geoJSON(apenasSalas, configVisual).addTo(grupoSalas);
        L.geoJSON(apenasBanheiros, configVisual).addTo(grupoBanheiros);

        // --- DESENHANDO AS RUAS ---
        L.geoJSON(ruas, {
            style: { color: "#ffffff", weight: 4, opacity: 0.6 }
        }).addTo(grupoRuas);

        // --- DESENHANDO A BIBLIOTECA ---
        L.geoJSON(biblioteca, {
            style: { color: "#8a2be2", weight: 2, fillColor: "#8a2be2", fillOpacity: 0.4 },
            onEachFeature: function (feature, layer) {
                layer.on('add', function () {
                    const centro = layer.getBounds().getCenter();
                    const htmlPopup = `
                    <div style="text-align: center; font-family: Arial;">
                        <h3 style="margin: 0 0 5px 0; color: #12472b;">Biblioteca</h3>
                        <hr style="border: 1px solid #eee;">
                        <button class="btn-rota" style="margin-top:10px;" onclick="window.tracarRota(${centro.lat}, ${centro.lng}, 'Biblioteca')">📍 Como Chegar</button>
                    </div>
                    `;
                    layer.bindPopup(htmlPopup);
                });
            }
        }).addTo(grupoBiblioteca);

        // --- DESENHANDO AS CANTINAS ---
        L.geoJSON(cantinas, {
            style: { color: "#ff4500", weight: 2, fillColor: "#ff4500", fillOpacity: 0.4 },
            onEachFeature: function (feature, layer) {
                layer.on('add', function () {
                    const latlng = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter();
                    const nome = feature.properties.NOME || 'Cantina';
                    const horario = feature.properties.HORARIO || '';
                    const htmlPopup = `
                    <div style="text-align: center; font-family: Arial;">
                        <h3 style="margin: 0 0 5px 0; color: #12472b;">${nome}</h3>
                        <hr style="border: 1px solid #eee;">
                        <b>Horário:</b> ${horario}
                        <button class="btn-rota" style="margin-top:10px;" onclick="window.tracarRota(${latlng.lat}, ${latlng.lng}, '${nome}')">📍 Como Chegar</button>
                    </div>
                    `;
                    layer.bindPopup(htmlPopup);
                });
            }
        }).addTo(grupoCantinas);

        // CONSTRUIR O GRAFO DAS RUAS PARA ROTEAMENTO
        window.grafoRotas = new GrafoRotas(ruas);

        map.fitBounds(grupoBlocos.getBounds());

        // Dispara a regra de zoom pela primeira vez ao carregar a página
        gerenciarZoom();

        // Esconde a Splash Screen (Premium UI/UX)
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('splash-escondido');
            setTimeout(() => {
                splash.style.display = 'none';
            }, 600); // Aguarda a animação de opacidade terminar
        }
    })
    .catch(erro => {
        console.error("Erro ao carregar arquivos:", erro);
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.innerHTML = '<h2>Oops!</h2><p>Erro ao carregar os dados do mapa.</p>';
        }
    });


// ==========================================
// 5. LÓGICA DE BUSCA E PAINEL DE ROTAS
// ==========================================
const containerBuscaSimples = document.getElementById('container-busca-simples');
const containerRotas = document.getElementById('container-rotas');
const btnAbrirRotas = document.getElementById('btn-abrir-rotas');
const btnFecharRotas = document.getElementById('btn-fechar-rotas');
const btnInverterRotas = document.getElementById('btn-inverter-rotas');
const inputBusca = document.getElementById('busca-sala');
const inputOrigem = document.getElementById('input-origem');
const inputDestino = document.getElementById('input-destino');
const listaResultados = document.getElementById('lista-resultados');
const btnUsarGps = document.getElementById('btn-usar-gps');

let inputAtivo = inputBusca;
window.origemCoords = null;
window.destinoCoords = null;

function alternarModoRotas(abrir) {
    if (abrir) {
        containerBuscaSimples.classList.add('oculto');
        containerRotas.classList.remove('oculto');
        if (inputBusca.value && !inputDestino.value) {
            inputDestino.value = inputBusca.value;
        }
        inputAtivo = inputOrigem;
        inputOrigem.focus();
    } else {
        containerRotas.classList.add('oculto');
        containerBuscaSimples.classList.remove('oculto');
        inputAtivo = inputBusca;
        listaResultados.classList.add('resultados-oculto');
        
        // Se a rota estava ativa mas fechamos o painel, a linha some
        if (window.rotaAtual) {
            map.removeLayer(window.rotaAtual);
            window.rotaAtual = null;
            document.getElementById('toast-distancia')?.classList.remove('visivel');
        }
    }
}

if (btnAbrirRotas) btnAbrirRotas.addEventListener('click', () => alternarModoRotas(true));
if (btnFecharRotas) btnFecharRotas.addEventListener('click', () => alternarModoRotas(false));

if (btnInverterRotas) {
    btnInverterRotas.addEventListener('click', () => {
        const tempVal = inputOrigem.value;
        inputOrigem.value = inputDestino.value;
        inputDestino.value = tempVal;

        const tempCoords = window.origemCoords;
        window.origemCoords = window.destinoCoords;
        window.destinoCoords = tempCoords;

        tentarTracarRota();
    });
}

if (btnUsarGps) {
    btnUsarGps.addEventListener('click', () => {
        if (marcadorGps) {
            inputOrigem.value = "Meu Local (GPS)";
            const latlng = marcadorGps.getLatLng();
            window.origemCoords = [latlng.lat, latlng.lng];
            tentarTracarRota();
        } else {
            alert("Ative seu GPS clicando no botão 🎯 no canto inferior direito primeiro.");
        }
    });
}

[inputBusca, inputOrigem, inputDestino].forEach(input => {
    if (!input) return;
    input.addEventListener('focus', () => {
        inputAtivo = input;
        if (input.value.length >= 2) input.dispatchEvent(new Event('input'));
    });

    input.addEventListener('input', (evento) => {
        const termo = evento.target.value.toLowerCase();
        listaResultados.innerHTML = '';

        if (termo.length < 2) {
            listaResultados.classList.add('resultados-oculto');
            return;
        }

        let encontrou = false;

        [grupoSalas, grupoBanheiros].forEach(grupo => {
            grupo.eachLayer(layerGEOJSON => {
                layerGEOJSON.eachLayer(layerSala => {
                    const props = layerSala.feature.properties;
                    const nome = props.nome || "";

                    if (nome.toLowerCase().includes(termo)) {
                        adicionarResultadoBusca(nome, `Bloco ${props.fk_bloco} • ${props.tipo}`, props.tipo, layerSala);
                        encontrou = true;
                    }
                });
            });
        });

        grupoBiblioteca.eachLayer(layerGEOJSON => {
            if ("biblioteca".includes(termo)) {
                adicionarResultadoBusca("Biblioteca", "Prédio Principal", "Biblioteca", layerGEOJSON);
                encontrou = true;
            }
        });

        grupoCantinas.eachLayer(layerGEOJSON => {
            layerGEOJSON.eachLayer(layerCantina => {
                const props = layerCantina.feature.properties;
                const nome = props.NOME || "Cantina";
                if (nome.toLowerCase().includes(termo)) {
                    adicionarResultadoBusca(nome, `Horário: ${props.HORARIO}`, "Cantina", layerCantina);
                    encontrou = true;
                }
            });
        });

        if (encontrou) {
            listaResultados.classList.remove('resultados-oculto');
        } else {
            listaResultados.innerHTML = `<li class="msg-erro-pesquisa">Nenhum local encontrado com "${evento.target.value}"</li>`;
            listaResultados.classList.remove('resultados-oculto');
        }
    });
});

function adicionarResultadoBusca(nome, detalhe, tipo, layer) {
    const li = document.createElement('li');
    let iconeStr = '📍';
    if (tipo === 'Sanitário') iconeStr = '🚻';
    else if (tipo === 'LAB') iconeStr = '💻';
    else if (tipo === 'Sala de Aula') iconeStr = '🚪';
    else if (tipo === 'Biblioteca') iconeStr = '📚';
    else if (tipo === 'Cantina') iconeStr = '🍔';

    li.innerHTML = `
        <span class="resultado-icone">${iconeStr}</span>
        <div class="resultado-info">
            <span class="resultado-nome">${nome}</span>
            <span class="resultado-detalhe">${detalhe}</span>
        </div>
    `;

    li.addEventListener('click', () => {
        listaResultados.classList.add('resultados-oculto');
        inputAtivo.value = nome;

        let latlng;
        if (layer.getLatLng) {
            latlng = layer.getLatLng();
        } else if (layer.getBounds) {
            latlng = layer.getBounds().getCenter();
        } else {
            const l = layer.getLayers()[0];
            latlng = l.getLatLng ? l.getLatLng() : l.getBounds().getCenter();
            layer = l;
        }

        if (inputAtivo === inputBusca) {
            if (typeof fecharPaineis === 'function') fecharPaineis();
            map.flyToBounds(layer.getBounds ? layer.getBounds() : [latlng.lat, latlng.lng], { maxZoom: 21, duration: 1.5 });
            if (layer.openPopup) layer.openPopup();
        } else if (inputAtivo === inputOrigem) {
            window.origemCoords = [latlng.lat, latlng.lng];
            inputDestino.focus();
            tentarTracarRota();
        } else if (inputAtivo === inputDestino) {
            window.destinoCoords = [latlng.lat, latlng.lng];
            tentarTracarRota();
        }
    });

    listaResultados.appendChild(li);
}

document.addEventListener('click', (evento) => {
    if (!document.getElementById('painel-busca').contains(evento.target)) {
        listaResultados.classList.add('resultados-oculto');
    }
});

function tentarTracarRota() {
    if (window.origemCoords && window.destinoCoords) {
        tracarRotaCore(window.origemCoords[0], window.origemCoords[1], window.destinoCoords[0], window.destinoCoords[1]);
    }
}

// ==========================================
// 6. LÓGICA DA INTERFACE MOBILE (BOTTOM NAV)
// ==========================================
const btnBusca = document.getElementById('btn-busca');
const btnCamadas = document.getElementById('btn-camadas');
const btnInicio = document.getElementById('btn-inicio');

const painelBusca = document.getElementById('painel-busca');
const painelCamadas = document.getElementById('painel-camadas');
const overlayMobile = document.getElementById('overlay-mobile');

// Função para fechar qualquer painel aberto
function fecharPaineis() {
    if (painelBusca) painelBusca.classList.remove('aberto');
    if (painelCamadas) painelCamadas.classList.remove('aberto');
    if (overlayMobile) overlayMobile.classList.remove('visivel');

    if (btnBusca) btnBusca.classList.remove('ativo');
    if (btnCamadas) btnCamadas.classList.remove('ativo');
}

// Função para alternar o estado do painel
function alternarPainel(painel, btn) {
    if (painel.classList.contains('aberto')) {
        fecharPaineis();
    } else {
        fecharPaineis(); // Fecha outros antes de abrir este
        painel.classList.add('aberto');
        overlayMobile.classList.add('visivel');
        btn.classList.add('ativo');
    }
}

// Atrelando os cliques aos botões da barra inferior
if (btnBusca) btnBusca.addEventListener('click', () => alternarPainel(painelBusca, btnBusca));
if (btnCamadas) btnCamadas.addEventListener('click', () => alternarPainel(painelCamadas, btnCamadas));

// Botão Início: Fecha os painéis e centraliza a câmera
if (btnInicio) {
    btnInicio.addEventListener('click', () => {
        fecharPaineis();
        // Usa as coordenadas de foco originais ou os limites do grupo
        if (grupoBlocos && grupoBlocos.getBounds().isValid()) {
            map.flyToBounds(grupoBlocos.getBounds(), { duration: 1.5 });
        } else {
            map.flyTo([-26.2503, -48.8559], 19, { duration: 1.5 });
        }
    });
}

// Fechar painéis ao clicar na parte escura (overlay) ou na alça
if (overlayMobile) overlayMobile.addEventListener('click', fecharPaineis);
if (document.getElementById('handle-busca')) document.getElementById('handle-busca').addEventListener('click', fecharPaineis);
if (document.getElementById('handle-camadas')) document.getElementById('handle-camadas').addEventListener('click', fecharPaineis);

// Lógica inteligente para mover o menu de camadas do Leaflet para dentro do painel
function ajustarControleCamadasMobile() {
    const containerCamadas = document.getElementById('camadas-container');
    if (!containerCamadas || !controleCamadas) return;

    const controleElemento = controleCamadas.getContainer();

    if (window.innerWidth <= 768) {
        // Celular: Move para dentro do Bottom Sheet de Camadas
        if (!containerCamadas.contains(controleElemento)) {
            containerCamadas.appendChild(controleElemento);
        }
    } else {
        // Desktop: Devolve para o canto superior direito do Leaflet
        const leafletTopRight = document.querySelector('.leaflet-top.leaflet-right');
        if (leafletTopRight && !leafletTopRight.contains(controleElemento)) {
            leafletTopRight.appendChild(controleElemento);
        }
    }
}

// Checa na hora que carrega e caso o usuário gire o celular (resize)
ajustarControleCamadasMobile();
window.addEventListener('resize', ajustarControleCamadasMobile);

// ==========================================
// 7. GEOLOCALIZAÇÃO (GPS PADRÃO OURO)
// ==========================================
const btnGps = document.getElementById('btn-gps');
let marcadorGps = null;
let circuloPrecisaoGps = null;

if (btnGps) {
    btnGps.addEventListener('click', () => {
        // Ativa a animação de "buscando"
        btnGps.classList.add('rastreando');
        // Pede a localização ao navegador e centraliza se achar
        map.locate({ setView: true, maxZoom: 19, enableHighAccuracy: true });
    });
}

// Quando o navegador encontra a localização
map.on('locationfound', function (e) {
    btnGps.classList.remove('rastreando');

    // Se já havia um marcador antes, remove
    if (marcadorGps) {
        map.removeLayer(marcadorGps);
        map.removeLayer(circuloPrecisaoGps);
    }

    const raioDePrecisao = e.accuracy / 2;

    // Desenha a bolinha azul pulsante exata do usuário
    marcadorGps = L.circleMarker(e.latlng, {
        radius: 8,
        fillColor: "#007bff",
        color: "#ffffff",
        weight: 3,
        opacity: 1,
        fillOpacity: 1
    }).addTo(map);

    // Desenha o halo claro em volta mostrando a precisão do GPS
    circuloPrecisaoGps = L.circle(e.latlng, raioDePrecisao, {
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 0.15,
        weight: 1
    }).addTo(map);
});

// Tratamento de falha do GPS
map.on('locationerror', function (e) {
    btnGps.classList.remove('rastreando');
    alert("Não foi possível acessar o GPS. Por favor, verifique se a localização está ativada em seu navegador.");
});

// ==========================================
// 8. INOVAÇÕES (ROTAS, ANDARES E PWA)
// ==========================================

// --- 8.1 Rotas em Linha Reta ---
window.rotaAtual = null;

window.tracarRota = function (destLat, destLng, nomeLocal) {
    if (typeof alternarModoRotas === 'function') alternarModoRotas(true);
    inputDestino.value = nomeLocal || "Destino selecionado";
    window.destinoCoords = [destLat, destLng];
    
    if (marcadorGps && !window.origemCoords) {
        inputOrigem.value = "Meu Local (GPS)";
        const gpsLatlng = marcadorGps.getLatLng();
        window.origemCoords = [gpsLatlng.lat, gpsLatlng.lng];
        tentarTracarRota();
    } else if (!window.origemCoords) {
        inputOrigem.focus();
    } else {
        tentarTracarRota();
    }
    
    map.closePopup();
};

function tracarRotaCore(startLat, startLng, destLat, destLng) {
    if (window.rotaAtual) {
        map.removeLayer(window.rotaAtual);
    }

    let latlngs = [];

    if (window.grafoRotas && window.grafoRotas.adj.size > 0) {
        const noInicio = window.grafoRotas.encontrarNoMaisProximo(startLat, startLng);
        const noFim = window.grafoRotas.encontrarNoMaisProximo(destLat, destLng);

        if (noInicio && noFim) {
            const caminhoGrafo = window.grafoRotas.encontrarCaminhoMaisCurto(noInicio, noFim);
            if (caminhoGrafo.length > 0) {
                latlngs.push([startLat, startLng]);
                latlngs.push(...caminhoGrafo);
                latlngs.push([destLat, destLng]);
            }
        }
    }

    if (latlngs.length === 0) {
        latlngs = [
            [startLat, startLng],
            [destLat, destLng]
        ];
    }

    window.rotaAtual = L.polyline(latlngs, {
        color: '#ffc107',
        weight: 4,
        className: 'linha-rota'
    }).addTo(map);

    map.fitBounds(window.rotaAtual.getBounds(), { padding: [50, 50], maxZoom: 20 });

    let dist = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        dist += map.distance(latlngs[i], latlngs[i + 1]);
    }
    mostrarToastDistancia(`Caminho: ${Math.round(dist)} metros`);
};

function mostrarToastDistancia(msg) {
    let toast = document.getElementById('toast-distancia');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-distancia';
        toast.className = 'toast-distancia';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('visivel');
    setTimeout(() => toast.classList.remove('visivel'), 5000);
}

// --- 8.2 Seletor de Andares ---
const andaresBotoes = document.querySelectorAll('.btn-andar');

andaresBotoes.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remove estado ativo de todos e coloca no clicado
        andaresBotoes.forEach(b => b.classList.remove('ativo'));
        e.target.classList.add('ativo');

        const andarSelecionado = e.target.getAttribute('data-andar');

        // Limpa as camadas antigas
        grupoSalas.clearLayers();
        grupoBanheiros.clearLayers();

        // Filtra os dados originais
        const salasFiltradas = {
            type: "FeatureCollection",
            features: window.salasOriginais.features.filter(f =>
                f.properties.tipo !== 'Sanitário' &&
                (andarSelecionado === 'todos' || f.properties.andar === andarSelecionado)
            )
        };

        const banheirosFiltrados = {
            type: "FeatureCollection",
            features: window.salasOriginais.features.filter(f =>
                f.properties.tipo === 'Sanitário' &&
                (andarSelecionado === 'todos' || f.properties.andar === andarSelecionado)
            )
        };

        // Redesenha apenas os filtrados
        L.geoJSON(salasFiltradas, window.configVisual).addTo(grupoSalas);
        L.geoJSON(banheirosFiltrados, window.configVisual).addTo(grupoBanheiros);
    });
});

// --- 8.3 Registro do PWA (Offline) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(registro => {
            console.log('Service Worker registrado com sucesso: ', registro.scope);
        }).catch(erro => {
            console.log('Falha ao registrar o Service Worker: ', erro);
        });
    });
}
