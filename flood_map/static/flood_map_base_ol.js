proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs");
ol.proj.proj4.register(proj4);

const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM(),
    // title: 'OpenStreetMap',
    type: 'base',
    visible: true
});

function getTransparentLayer(attribution, visible = false) {
    const transparentLayer = new ol.layer.Tile({
        source: new ol.source.TileWMS({
            url: '',
            params: {},
            serverType: 'geoserver',
            attributions: attribution
        }),
        visible: visible
    });
    return transparentLayer;
}

const wmsHamburgDOP = new ol.layer.Tile({
    source: new ol.source.TileWMS({
        url: 'https://geodienste.hamburg.de/HH_WMS_DOP',
        params: {
            'LAYERS': 'DOP',
            'FORMAT': 'image/png',
            'TRANSPARENT': true
        },
        attributions: '&copy <a href="https://www.hamburg.de/bsw/landesbetrieb-geoinformation-und-vermessung/">Freie und Hansestadt Hamburg, LGV</a>',
    }),
    visible: false
});

const wmsNiDOP = new ol.layer.Tile({
    source: new ol.source.TileWMS({
        url: 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms',
        params: {
            'LAYERS': 'ni_dop20',
            'FORMAT': 'image/png',
            'TRANSPARENT': true
        },
        attributions: '&copy <a href="https://www.lgln.niedersachsen.de">LGLN</a> (2025) <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
    }),
    visible: false
});

const wmsNWDOP = new ol.layer.Tile({
    source: new ol.source.TileWMS({
        url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop',
        params: {
            'LAYERS': 'nw_dop_rgb',
            'FORMAT': 'image/png',
            'TRANSPARENT': true
        },
        attributions: '&copy <a href="https://www.bezreg-koeln.nrw.de/geobasis-nrw">Bezirksregierung Köln</a>',
    }),
    visible: false
});

const wmsSHDOP = new ol.layer.Tile({
    source: new ol.source.TileWMS({
        url: 'https://dienste.gdi-sh.de/WMS_SH_DOP20col_OpenGBD',
        params: {
            'LAYERS': 'sh_dop20_rgb',
            'FORMAT': 'image/png',
            'TRANSPARENT': true
        },
        attributions: '&copy GeoBasis-DE/LVermGeo SH/<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
    }),
    visible: false
});

const wmsHBDOP = new ol.layer.Tile({
    source: new ol.source.TileWMS({
        url: 'https://geodienste.bremen.de/wms_dop20_2023',
        params: {
            'LAYERS': 'DOP20_2023_HB,DOP20_2023_BHV',
            'FORMAT': 'image/png',
            'TRANSPARENT': true
        },
        attributions: '&copy <a href="https://www.geo.bremen.de/">Landesamt GeoInformation Bremen</a>',
    }),
    visible: false
});

const dopLayerGroup = new ol.layer.Group({
    layers: [wmsHamburgDOP, wmsNiDOP, wmsNWDOP, wmsSHDOP, wmsHBDOP],
    title: 'DOP',
    visible: false
});

const map = new ol.Map({
    target: 'map',
    layers: [osmLayer, dopLayerGroup, ],
    view: new ol.View({
        center: ol.proj.fromLonLat([7.29, 52.52]),
        zoom: 15
    }),
});
const scaleLine = new ol.control.ScaleLine();
map.addControl(scaleLine);
const layerSwitcher = new LayerSwitcher({});
map.addControl(layerSwitcher);
const sourceLayer = getTransparentLayer('<a href="https://github.com/jaluebbe/FloodMap">Source on GitHub</a>', true);
map.addLayer(sourceLayer);
// add link to an imprint and a privacy statement if the file is available.
const imprintLayer = getTransparentLayer('<a href="/static/datenschutz.html" target="_blank">Impressum & Datenschutzerkl&auml;rung</a>', true);
fetch('/static/datenschutz.html', {
        method: 'HEAD'
    })
    .then(response => {
        if (response.ok) {
            map.addLayer(imprintLayer);
        }
    })
