var map = L.map('map').setView([52.5, 7.3], 15);
// uncomment the following to enable geolocation in the browser
/*
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
        map.setView([position.coords.latitude, position.coords.longitude]);
    });
}*/
map.attributionControl.addAttribution(
    '<a href="https://github.com/jaluebbe/FloodMap">Source on GitHub</a>');
// add link to an imprint and a privacy statement if the file is available.
function addPrivacyStatement() {
    var xhr = new XMLHttpRequest();
    xhr.open('HEAD', "/static/datenschutz.html");
    xhr.onload = function() {
        if (xhr.status === 200)
            map.attributionControl.addAttribution(
                '<a href="/static/datenschutz.html" target="_blank">Impressum & Datenschutzerkl&auml;rung</a>'
            );
    }
    xhr.send();
}
addPrivacyStatement();

var topPlusOpenLayer = L.tileLayer('https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png', {
    attribution: '&copy <a href="https://www.bkg.bund.de">BKG</a> 2025, ' +
        '<a href= "http://sg.geodatenzentrum.de/web_public/Datenquellen_TopPlus_Open.pdf" >data sources</a> ',
    minZoom: 5,
}).addTo(map);
var wmsHamburgDOP = L.tileLayer.wms('https://geodienste.hamburg.de/HH_WMS_DOP', {
    layers: 'DOP',
    format: 'image/png',
    transparent: true,
    attribution: '&copy <a href="https://www.hamburg.de/bsw/landesbetrieb-geoinformation-und-vermessung/">' +
        'Freie und Hansestadt Hamburg, LGV</a>',
    minZoom: 12,
    maxZoom: 20,
    bounds: [
        [53.3, 8.4],
        [54, 10.4]
    ]
});
var wmsNiDOP = L.tileLayer.wms('https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms', {
    layers: 'ni_dop20',
    format: 'image/png',
    transparent: true,
    attribution: '&copy <a href="https://www.lgln.niedersachsen.de">LGLN</a> (2025) <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
    minZoom: 12,
    maxZoom: 20,
    bounds: [
        [51.29, 6.6],
        [53.9, 11.6]
    ]
});
var wmsNWDOP = L.tileLayer.wms('https://www.wms.nrw.de/geobasis/wms_nw_dop', {
    layers: 'nw_dop_rgb',
    format: 'image/png',
    transparent: true,
    attribution: '&copy <a href="https://www.bezreg-koeln.nrw.de/geobasis-nrw">Bezirksregierung Köln</a>',
    minZoom: 12,
    maxZoom: 20,
    bounds: [
        [50.3, 5.8],
        [52.4, 9.5]
    ]
});
var wmsSHDOP = L.tileLayer.wms('https://dienste.gdi-sh.de/WMS_SH_DOP20col_OpenGBD', {
    layers: 'sh_dop20_rgb',
    format: 'image/png',
    transparent: true,
    attribution: '&copy GeoBasis-DE/LVermGeo SH/<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
    minZoom: 12,
    maxZoom: 20,
    bounds: [
        [55, 7.8],
        [53.4, 11.4]
    ]
});
var wmsHBDOP = L.tileLayer.wms('https://geodienste.bremen.de/wms_dop20_2023', {
    layers: 'DOP20_2023_HB,DOP20_2023_BHV',
    format: 'image/png',
    transparent: true,
    attribution: '&copy <a href="https://www.geo.bremen.de/">Landesamt GeoInformation Bremen</a>',
    minZoom: 12,
    maxZoom: 20,
    bounds: [
        [53, 8.4],
        [53.61, 9]
    ]
});

var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    minZoom: 5,
});

L.control.scale({
    'imperial': false
}).addTo(map);

dopLayerGroup = L.layerGroup([wmsHamburgDOP, wmsNiDOP, wmsNWDOP, wmsSHDOP, wmsHBDOP], {
    minZoom: 12,
    maxZoom: 20
});

baseLayers = {
    "TopPlusOpen": topPlusOpenLayer,
    "OpenStreetMap": osmLayer,
    "DOP": dopLayerGroup
};
var other_layers = {};
var layerControl = L.control.layers(baseLayers, other_layers, {
    collapsed: L.Browser.mobile, // hide on mobile devices
    position: 'topright'
}).addTo(map);
