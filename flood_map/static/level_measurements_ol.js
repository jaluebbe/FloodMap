const Style = ol.style.Style;
const Icon = ol.style.Icon;
const VectorSource = ol.source.Vector;
const VectorLayer = ol.layer.Vector;
const Overlay = ol.Overlay;
const GeoJSON = ol.format.GeoJSON;
const Feature = ol.Feature;
const Point = ol.geom.Point;

const yellowLevelStaff = new Style({
    image: new Icon({
        src: '/static/img/level_staff_yellow.svg',
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
    }),
});
const whiteLevelStaff = new Style({
    image: new Icon({
        src: '/static/img/level_staff_white.svg',
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
    }),
});

const vectorSource = new VectorSource({
    attributions: [
        '&copy; <a href="https://pegelonline.wsv.de/">WSV</a>',
        '&copy; <a href="https://www.pegelonline.nlwkn.niedersachsen.de/">NLWKN</a>'
    ]
});
const vectorLayer = new VectorLayer({
    source: vectorSource,
    title: 'water level stations',
});

const tooltipElement = document.createElement('div');
tooltipElement.className = 'ol-tooltip level-tooltip';
document.body.appendChild(tooltipElement);

const tooltipOverlay = new Overlay({
    element: tooltipElement,
    positioning: 'bottom-center',
    offset: [0, -121 - 5],
});
map.addOverlay(tooltipOverlay);

function loadWsvData() {
    fetchWsvStations().then(data => {
        const geojson = createWsvGeoJSON(data);
        const features = new GeoJSON().readFeatures(geojson);
        features.forEach(feature => {
            const coordinates = feature.getGeometry().getCoordinates();
            const transformedCoordinates = ol.proj.fromLonLat(coordinates);
            const properties = feature.getProperties();
            properties.source = 'WSV';
            const levelStaffFeature = new Feature({
                geometry: new Point(transformedCoordinates),
                properties: properties,
            });
            vectorSource.addFeature(levelStaffFeature);
            levelStaffFeature.setStyle(yellowLevelStaff);
        });
    });
}

function loadNlwknData() {
    fetchNlwknData().then(data => {
        const geojson = createGeoJSONFromNLWKN(data);
        const features = new GeoJSON().readFeatures(geojson);
        features.forEach(feature => {
            const coordinates = feature.getGeometry().getCoordinates();
            const transformedCoordinates = ol.proj.fromLonLat(coordinates);
            const properties = feature.getProperties();
            properties.source = 'NLWKN';
            const levelStaffFeature = new Feature({
                geometry: new Point(transformedCoordinates),
                properties: properties,
            });
            vectorSource.addFeature(levelStaffFeature);
            levelStaffFeature.setStyle(whiteLevelStaff);
        });
    });
}

loadWsvData();
loadNlwknData();

let currentFeature = null;
map.on('pointermove', function(evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, function(feature) {
        return feature;
    });
    if (feature !== currentFeature) {
        currentFeature = feature;
        if (!feature) {
            tooltipElement.style.display = 'none';
            return;
        }
        const coordinates = feature.getGeometry().getCoordinates();
        const properties = feature.getProperties().properties;
        tooltipOverlay.setPosition(coordinates);
        if (properties.source === 'WSV') {
            const tooltipContent = `
                <strong>${properties.longname}</strong><br>
                <strong>${properties.water.longname}</strong> (km ${properties.km})
            `;
            tooltipElement.innerHTML = tooltipContent;

            const uuid = properties.uuid;
            const url = `https://pegelonline.wsv.de/webservices/rest-api/v2/stations/${uuid}/W/measurements.json?start=PT3H`;
            fetch(url).then(response => response.json()).then(measurements => {
                if (measurements.length > 0) {
                    const lastMeasurement = measurements[measurements.length - 1];
                    const value = lastMeasurement.value;
                    const time = formatTime(lastMeasurement.timestamp);
                    let tooltipContent = `
                        <strong>${properties.longname}</strong><br>
                        <strong>${properties.water.longname}</strong> (km ${properties.km})<br>
                        <strong>${value} ${properties.unit}</strong> (${time})
                    `;
                    if (properties.gaugeZero && (properties.gaugeZero.unit === 'm. ü. NN' || properties.gaugeZero.unit === 'm. ü. NHN') && properties.unit === 'cm') {
                        const gaugeZeroValue = properties.gaugeZero.value;
                        const adjustedValue = (value / 100) + gaugeZeroValue;
                        tooltipContent += `<br><strong>${adjustedValue.toFixed(2)} ${properties.gaugeZero.unit}</strong>`;
                    }
                    tooltipElement.innerHTML = tooltipContent;
                }
            }).catch(error => console.error('Error fetching measurements:', error));
        } else if (properties.source === 'NLWKN') {
            let tooltipContent = `
            <strong>${properties.Name}</strong><br>
            <strong>${properties.GewaesserName}</strong><br>
            <strong>${properties.AktuellerMesswert} ${properties.Einheit}</strong> (${properties.time})<br>
            <strong>${properties.AktuellerMesswertNNM} m+NN</strong>
            `;
            tooltipElement.innerHTML = tooltipContent;
            fetchNlwknStationData(properties.STA_ID).then(data => {
                const datenspur = data.Parameter[0].Datenspuren[0];
                const time = datenspur.AktuellerMesswert_Zeitpunkt.split(' ')[1];
                tooltipContent = `
                    <strong>${properties.Name}</strong><br>
                    <strong>${properties.GewaesserName}</strong><br>
                    <strong>${datenspur.AktuellerMesswert} ${datenspur.ParameterEinheit}</strong> (${time})<br>
                    <strong>${datenspur.AktuellerMesswertNNM} m+NN</strong>
                `;
                tooltipElement.innerHTML = tooltipContent;
            });
        }
        tooltipElement.style.display = 'block';
    }
});

map.addLayer(vectorLayer);

map.getView().on('change:resolution', function() {
    const zoom = map.getView().getZoom();
    vectorLayer.setVisible(zoom >= 9);
});
