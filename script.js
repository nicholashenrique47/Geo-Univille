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

const controleCamadas = L.control.layers(
    {
        "Satélite (Google)": camadaSateliteGoogle,
        "Satélite (Esri)": camadaSateliteEsri,
        "Mapa de Ruas": camadaRua
    },
    {
        "🏢 Blocos": grupoBlocos,
        "🚪 Salas e Labs": grupoSalas,
        "🚻 Banheiros": grupoBanheiros
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
// 4. CARREGAMENTO DOS DADOS E APLICAÇÃO DOS ÍCONES
// ==========================================
Promise.all([
    fetch('./dados_geojson/blocos_univille1.geojson').then(res => res.json()),
    fetch('./dados_geojson/salas_univille.geojson').then(res => res.json())
])
    .then(([blocos, salas]) => {

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

                // Usamos um evento 'add' para pegar o centro real do polígono para a rota
                layer.on('add', function() {
                    const centro = layer.getBounds().getCenter();
                    const htmlPopup = `
                    <div style="text-align: center; font-family: Arial;">
                        <h3 style="margin: 0 0 5px 0; color: #12472b;">${feature.properties.nome}</h3>
                        <hr style="border: 1px solid #eee;">
                        <b>Bloco:</b> ${feature.properties.fk_bloco}<br>
                        <b>Andar:</b> ${feature.properties.andar}<br>
                        <b>Tipo:</b> ${feature.properties.tipo}
                        <button class="btn-rota" onclick="window.tracarRota(${centro.lat}, ${centro.lng})">📍 Como Chegar</button>
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
// 5. LÓGICA DE BUSCA APRIMORADA
// ==========================================
const inputBusca = document.getElementById('busca-sala');
const listaResultados = document.getElementById('lista-resultados');

inputBusca.addEventListener('input', (evento) => {
    const termo = evento.target.value.toLowerCase();
    listaResultados.innerHTML = '';

    if (termo.length < 2) {
        listaResultados.classList.add('resultados-oculto');
        return;
    }

    let encontrou = false;

    // Varre as salas E os banheiros para a busca
    [grupoSalas, grupoBanheiros].forEach(grupo => {
        grupo.eachLayer(layerGEOJSON => {
            layerGEOJSON.eachLayer(layerSala => {
                const props = layerSala.feature.properties;
                const nome = props.nome || "";

                if (nome.toLowerCase().includes(termo)) {
                    encontrou = true;
                    const li = document.createElement('li');

                    // Define qual ícone usar com base no tipo
                    let iconeStr = '📍';
                    if (props.tipo === 'Sanitário') iconeStr = '🚻';
                    else if (props.tipo === 'LAB') iconeStr = '💻';
                    else if (props.tipo === 'Sala de Aula') iconeStr = '🚪';

                    // Constrói o HTML do item da lista usando as novas classes do CSS
                    li.innerHTML = `
                        <span class="resultado-icone">${iconeStr}</span>
                        <div class="resultado-info">
                            <span class="resultado-nome">${nome}</span>
                            <span class="resultado-detalhe">Bloco ${props.fk_bloco} • ${props.tipo}</span>
                        </div>
                    `;

                    // Evento de clique para focar no local
                    li.addEventListener('click', () => {
                        listaResultados.classList.add('resultados-oculto');
                        inputBusca.value = nome;

                        // Fecha o painel mobile (se existir a função)
                        if (typeof fecharPaineis === 'function') fecharPaineis();

                        // Garante que o grupo certo esteja ligado no menu de camadas
                        if (!map.hasLayer(grupo)) {
                            map.addLayer(grupo);
                        }

                        // Força o zoom máximo para o texto/ícone aparecer e abre o popup
                        map.flyToBounds(layerSala.getBounds(), { maxZoom: 21, duration: 1.5 });
                        layerSala.openPopup();
                    });

                    listaResultados.appendChild(li);
                }
            });
        });
    });

    if (encontrou) {
        listaResultados.classList.remove('resultados-oculto');
    } else {
        // Feedback elegante se não encontrar salas (Padrão Ouro)
        listaResultados.innerHTML = `<li class="msg-erro-pesquisa">Nenhuma sala encontrada com "${evento.target.value}"</li>`;
        listaResultados.classList.remove('resultados-oculto');
    }
});

document.addEventListener('click', (evento) => {
    if (!inputBusca.contains(evento.target) && !listaResultados.contains(evento.target)) {
        listaResultados.classList.add('resultados-oculto');
    }
});

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
    if(painelBusca) painelBusca.classList.remove('aberto');
    if(painelCamadas) painelCamadas.classList.remove('aberto');
    if(overlayMobile) overlayMobile.classList.remove('visivel');
    
    if(btnBusca) btnBusca.classList.remove('ativo');
    if(btnCamadas) btnCamadas.classList.remove('ativo');
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
if(btnBusca) btnBusca.addEventListener('click', () => alternarPainel(painelBusca, btnBusca));
if(btnCamadas) btnCamadas.addEventListener('click', () => alternarPainel(painelCamadas, btnCamadas));

// Botão Início: Fecha os painéis e centraliza a câmera
if(btnInicio) {
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
if(overlayMobile) overlayMobile.addEventListener('click', fecharPaineis);
if(document.getElementById('handle-busca')) document.getElementById('handle-busca').addEventListener('click', fecharPaineis);
if(document.getElementById('handle-camadas')) document.getElementById('handle-camadas').addEventListener('click', fecharPaineis);

// Lógica inteligente para mover o menu de camadas do Leaflet para dentro do painel
function ajustarControleCamadasMobile() {
    const containerCamadas = document.getElementById('camadas-container');
    if(!containerCamadas || !controleCamadas) return;

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
map.on('locationfound', function(e) {
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
map.on('locationerror', function(e) {
    btnGps.classList.remove('rastreando');
    alert("Não foi possível acessar o GPS. Por favor, verifique se a localização está ativada em seu navegador.");
});

// ==========================================
// 8. INOVAÇÕES (ROTAS, ANDARES E PWA)
// ==========================================

// --- 8.1 Rotas em Linha Reta ---
window.rotaAtual = null;

window.tracarRota = function(destLat, destLng) {
    if (!marcadorGps) {
        alert("📍 Ative sua localização (botão de alvo ali no canto) primeiro para eu traçar uma rota para você!");
        return;
    }
    const startLat = marcadorGps.getLatLng().lat;
    const startLng = marcadorGps.getLatLng().lng;

    if (window.rotaAtual) {
        map.removeLayer(window.rotaAtual);
    }

    window.rotaAtual = L.polyline([
        [startLat, startLng],
        [destLat, destLng]
    ], {
        color: '#ffc107', // Amarelo Univille
        weight: 4,
        className: 'linha-rota' // Animação via CSS
    }).addTo(map);

    // Zoom para mostrar a pessoa e a sala
    map.fitBounds(window.rotaAtual.getBounds(), { padding: [50, 50], maxZoom: 20 });

    const dist = map.distance([startLat, startLng], [destLat, destLng]);
    mostrarToastDistancia(`Caminho direto: ${Math.round(dist)} metros`);
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