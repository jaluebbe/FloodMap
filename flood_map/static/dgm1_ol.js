class ColorScaleControl extends ol.control.Control {
    constructor(options) {
        const element = document.createElement('div');
        element.className = 'color-scale-control ol-unselectable ol-control';
        const template = document.getElementById('colorScaleControlTemplate');
        element.appendChild(template.content.cloneNode(true));
        super({
            element: element,
            target: options.target
        });
    }
}
const colorScaleControl = new ColorScaleControl({});

class CustomControl extends ol.control.Control {
    constructor(options) {
        const element = document.createElement('div');
        element.className = 'custom-control ol-unselectable ol-control';
        const template = document.getElementById('customControlTemplate');
        element.appendChild(template.content.cloneNode(true));
        super({
            element: element,
            target: options.target
        });
    }
}
const customControl = new CustomControl({});

function updateLegend(customLevel) {
    document.getElementById('legendValueBlue').innerText = `< ${customLevel - 1}`;
    document.getElementById('legendValueRed').innerText = `${customLevel - 1} to ${customLevel}`;
    document.getElementById('legendValueYellow').innerText = `${customLevel} to ${customLevel + 0.5}`;
}

function customLevelChanged() {
    const customLevel = parseFloat(customLevelInput.value);
    if (!isNaN(customLevel)) {
        updateLegend(customLevel);
        fetchCustomData();
    }
}

function updateColorScale(colormap) {
    const img = document.getElementById('colorScaleImg');
    if (img) {
        img.src = colormap;
    }
}

var dgm1_terrain_bbox;
var lastCustomLevel;
var terrainRequestPending = false;
var dgm1_custom_bbox;
var customRequestPending = false;
const dgm1Attribution = '&copy DGM1, <a href="https://www.lgln.niedersachsen.de">LGLN</a> 2025'

const terrainLayerGroup = new ol.layer.Group({
    title: 'terrain',
    layers: [getTransparentLayer(dgm1Attribution)],
    visible: false,

});
map.addLayer(terrainLayerGroup);

const customLayerGroup = new ol.layer.Group({
    title: 'custom',
    layers: [getTransparentLayer(dgm1Attribution)],
    visible: false,
});
map.addLayer(customLayerGroup);

function getTransformedBounds() {
    const bounds = map.getView().calculateExtent(map.getSize());
    return ol.proj.transformExtent(bounds, 'EPSG:3857', 'EPSG:4326');
}

function isZoomLevelSufficient() {
    const zoom = map.getView().getZoom();
    return zoom >= 14;
}

function isWithinBoundingBox(minX, minY, maxX, maxY, bbox) {
    if (!bbox) return false;
    const [bboxMinX, bboxMinY, bboxMaxX, bboxMaxY] = bbox;
    return minX >= bboxMinX && minY >= bboxMinY && maxX <= bboxMaxX && maxY <= bboxMaxY;
}

function updateLayerGroup(layerGroup, tiles, opacity) {
    layerGroup.getLayers().getArray().slice(1).forEach(layer => layerGroup.getLayers().remove(layer));
    tiles.forEach(tile => {
        const geoTiffLayer = new ol.layer.Image({
            source: new ol.source.ImageStatic({
                url: tile.rasterImage,
                projection: 'EPSG:25832',
                imageExtent: tile.bounds
            }),
            opacity: opacity
        });
        layerGroup.getLayers().push(geoTiffLayer);
    });
}

function fetchTerrainData() {
    if (terrainRequestPending || !isZoomLevelSufficient() || !terrainLayerGroup.getVisible()) {
        return;
    }
    const [minX, minY, maxX, maxY] = getTransformedBounds();
    if (isWithinBoundingBox(minX, minY, maxX, maxY, dgm1_terrain_bbox)) {
        return;
    }
    const url = `/api/dgm1/terrain?` +
        `lat_min=${minY}&lon_min=${minX}&lat_max=${maxY}&lon_max=${maxX}`;
    terrainRequestPending = true;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.terrain && data.terrain.tiles) {
                dgm1_terrain_bbox = data.bbox;
                updateLayerGroup(terrainLayerGroup, data.terrain.tiles, 0.7);
                updateColorScale(data.terrain.colormap);
            }
        })
        .catch(error => console.error('Error fetching GeoTIFF data:', error))
        .finally(() => terrainRequestPending = false);
}

function fetchCustomData() {
    if (customRequestPending || !isZoomLevelSufficient() || !customLayerGroup.getVisible()) {
        return;
    }
    let customLevel = parseFloat(document.getElementById('customLevelInput').value);
    const [minX, minY, maxX, maxY] = getTransformedBounds();
    if (isWithinBoundingBox(minX, minY, maxX, maxY, dgm1_custom_bbox) && lastCustomLevel === customLevel) {
        return;
    }
    const url = `/api/dgm1/custom?` +
        `lat_min=${minY}&lon_min=${minX}&lat_max=${maxY}&lon_max=${maxX}&` +
        `custom_level=${customLevel}`;
    customRequestPending = true;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.custom && data.custom.tiles) {
                lastCustomLevel = data.custom.level;
                dgm1_custom_bbox = data.bbox;
                updateLayerGroup(customLayerGroup, data.custom.tiles, 0.7);
            }
        })
        .catch(error => console.error('Error fetching GeoTIFF data:', error))
        .finally(() => customRequestPending = false);
}

terrainLayerGroup.on('change:visible', function() {
    if (terrainLayerGroup.getVisible()) {
        map.addControl(colorScaleControl);
        fetchTerrainData();
    } else {
        map.removeControl(colorScaleControl);
    }
});
customLayerGroup.on('change:visible', function() {
    if (customLayerGroup.getVisible()) {
        map.addControl(customControl);
        fetchCustomData();
    } else {
        map.removeControl(customControl);
    }
});
map.on('moveend', () => {
    fetchTerrainData();
    fetchCustomData();
});
