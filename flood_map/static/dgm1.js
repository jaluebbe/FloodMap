map.createPane('terrain');
map.getPane('terrain').style.zIndex = 390;
map.createPane('custom');
map.getPane('custom').style.zIndex = 391;

const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs");

var colorScaleControl = L.control({
    position: 'bottomright'
});
colorScaleControl.onAdd = function(map) {
    this._div = L.DomUtil.create('div', 'color-scale-control');
    let tempSource = document.getElementById('colorScaleControlTemplate');
    this._div.appendChild(tempSource.content.cloneNode(true));
    L.DomEvent.disableClickPropagation(this._div);
    return this._div;
}

var customControl = L.control({
    position: 'topleft'
});
customControl.onAdd = function(map) {
    this._div = L.DomUtil.create('div', 'custom-control');
    let tempSource = document.getElementById('customControlTemplate');
    this._div.appendChild(tempSource.content.cloneNode(true));
    L.DomEvent.disableClickPropagation(this._div);
    return this._div;
}

function updateLegend(customLevel) {
    document.getElementById('legendValueBlue').innerText = `< ${customLevel - 1}`;
    document.getElementById('legendValueRed').innerText = `${customLevel - 1} to ${customLevel}`;
    document.getElementById('legendValueYellow').innerText = `${customLevel} to ${customLevel + 0.5}`;
    //    document.getElementById('legendValueGreen').innerText = `${customLevel + 0.5} to ${customLevel + 1}`;
}

function customLevelChanged() {
    const customLevel = parseFloat(customLevelInput.value);
    if (!isNaN(customLevel)) {
        updateLegend(customLevel);
        updateCustomLayer(customLevel);
    }
}

function updateColorScale(colormap) {
    const img = document.getElementById('colorScaleImg');
    if (img) {
        img.src = colormap;
    }
}

function projectRasterImage(rasterImage, bounds, crs, attribution, pane) {
    return L.imageOverlay.arrugator(
        rasterImage, {
            controlPoints: [
                [bounds[0], bounds[3]], // top-left
                [bounds[0], bounds[1]], // bottom-left
                [bounds[2], bounds[3]], // upper-right
                [bounds[2], bounds[1]], // lower-right
            ],
            projector: proj4(crs, 'EPSG:3857').forward,
            attribution: attribution,
            pane: pane
        })
}
var dgm1_bbox;
var lastCustomLevel;
var isFetching = false;
const dgm1Attribution = '&copy DGM1, <a href="https://www.lgln.niedersachsen.de">LGLN</a> 2025'
const terrainOverlay = L.layerGroup();
const customOverlay = L.layerGroup();
layerControl.addOverlay(terrainOverlay, "terrain");
layerControl.addOverlay(customOverlay, "custom");


async function fetchDGM1Data(bounds, terrain, custom, customLevel) {
    const lowerLeft = bounds.getSouthWest();
    const upperRight = bounds.getNorthEast();
    let url = `/api/dgm1?lat_min=${lowerLeft.lat}&lon_min=${lowerLeft.lng}` +
        `&lat_max=${upperRight.lat}&lon_max=${upperRight.lng}` +
        `&terrain=${terrain}&custom=${custom}`;
    if (customLevel !== undefined) {
        url += `&custom_level=${customLevel}`;
    }
    const response = await fetch(url);
    return response.json();
}

var colormap = undefined;

function updateLayers(dgm1_data) {
    terrainOverlay.clearLayers();
    customOverlay.clearLayers();

    if (dgm1_data.terrain && dgm1_data.terrain.tiles) {
        const terrainLayers = dgm1_data.terrain.tiles.map(tile =>
            projectRasterImage(
                tile.rasterImage,
                tile.bounds,
                tile.crs,
                dgm1Attribution,
                "terrain"
            )
        );
        terrainOverlay.addLayer(L.layerGroup(terrainLayers));
        colormap = dgm1_data.terrain.colormap;
    }

    if (dgm1_data.custom && dgm1_data.custom.tiles) {
        const customLayers = dgm1_data.custom.tiles.map(tile =>
            projectRasterImage(
                tile.rasterImage,
                tile.bounds,
                tile.crs,
                dgm1Attribution,
                "custom"
            )
        );
        customOverlay.addLayer(L.layerGroup(customLayers));
    }
}

async function checkZoomAndBounds(eventLayer) {
    if (isFetching) return;
    if (map.getZoom() > 14) {
        const map_bounds = map.getBounds();
        let customLevel;
        if (map.hasLayer(customOverlay) && document.getElementById('customLevelInput')) {
            customLevel = parseFloat(document.getElementById('customLevelInput').value);
        }
        if (eventLayer.type !== 'overlayremove' && eventLayer.type !== 'overlayadd' && dgm1_bbox !== undefined && lastCustomLevel === customLevel) {
            let dgm1_bounds = L.latLngBounds(
                L.latLng(dgm1_bbox[1], dgm1_bbox[0]),
                L.latLng(dgm1_bbox[3], dgm1_bbox[2])
            );
            if (dgm1_bounds.contains(map_bounds)) return;
        }
        if (map.hasLayer(terrainOverlay) || map.hasLayer(customOverlay)) {
            isFetching = true;
            try {
                const dgm1_data = await fetchDGM1Data(
                    map_bounds,
                    map.hasLayer(terrainOverlay),
                    map.hasLayer(customOverlay),
                    customLevel
                );
                if (dgm1_data.custom && dgm1_data.custom.level !== undefined) {
                    lastCustomLevel = dgm1_data.custom.level;
                }
                dgm1_bbox = dgm1_data.bbox;
                updateLayers(dgm1_data);
                if (map.hasLayer(terrainOverlay) && terrainOverlay.getLayers().length > 0) {
                    map.addControl(colorScaleControl);
                    updateColorScale(dgm1_data.terrain.colormap);
                } else {
                    map.removeControl(colorScaleControl);
                }
            } finally {
                isFetching = false;
            }
        }
    }
}

function updateCustomLayer(customLevel) {
    if (map.hasLayer(customOverlay)) {
        checkZoomAndBounds({
            type: 'overlayadd'
        });
    }
}

map.on('moveend', checkZoomAndBounds);
map.on('overlayadd', function(eventLayer) {
    if (eventLayer.name === "custom") {
        map.addControl(customControl);
        if (lastCustomLevel !== undefined)
            customLevelInput.value = lastCustomLevel;
        customLevelChanged();
    } else if (eventLayer.name === "terrain") {
        checkZoomAndBounds(eventLayer);
    }
});
map.on('overlayremove', function(eventLayer) {
    if (eventLayer.name === "terrain" || eventLayer.name === "custom") {
        checkZoomAndBounds(eventLayer);
    }
    if (eventLayer.name === "custom") {
        map.removeControl(customControl);
    }
});
