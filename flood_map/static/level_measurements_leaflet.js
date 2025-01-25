async function onWsvTooltipOpen(feature, marker) {
    const uuid = feature.properties.uuid;
    const url = `https://pegelonline.wsv.de/webservices/rest-api/v2/stations/${uuid}/W/measurements.json?start=PT3H`;

    try {
        const response = await fetch(url);
        const measurements = await response.json();

        if (measurements.length > 0) {
            const lastMeasurement = measurements[measurements.length - 1];
            const value = lastMeasurement.value;
            const time = formatTime(lastMeasurement.timestamp);

            let tooltipContent = `
                <strong>${feature.properties.longname}</strong><br>
                <strong>${feature.properties.water.longname}</strong> (km ${feature.properties.km})<br>
                <strong>${value} ${feature.properties.unit}</strong> (${time})
            `;

            if (feature.properties.gaugeZero && (feature.properties.gaugeZero.unit === 'm. ü. NN' || feature.properties.gaugeZero.unit === 'm. ü. NHN') && feature.properties.unit === 'cm') {
                const gaugeZeroValue = feature.properties.gaugeZero.value;
                const adjustedValue = (value / 100) + gaugeZeroValue;
                tooltipContent += `<br><strong>${adjustedValue.toFixed(2)} ${feature.properties.gaugeZero.unit}</strong>`;
            }

            marker.setTooltipContent(tooltipContent);
        }
    } catch (error) {
        console.error('Error fetching measurements:', error);
    }
}

async function onNlwknTooltipOpen(feature, marker) {
    const stationData = await fetchNlwknStationData(feature.properties.STA_ID);
    if (!stationData) return;
    const datenspur = stationData.Parameter[0].Datenspuren[0];
    const time = datenspur.AktuellerMesswert_Zeitpunkt.split(' ')[1];
    let tooltipContent = `
            <strong>${feature.properties.Name}</strong><br>
            <strong>${feature.properties.GewaesserName}</strong><br>
            <strong>${datenspur.AktuellerMesswert} ${datenspur.ParameterEinheit}</strong> (${time})<br>
            <strong>${datenspur.AktuellerMesswertNNM} m+NN</strong>
    `;
    marker.setTooltipContent(tooltipContent);
}

function createMarker(feature, latlng, iconUrl, tooltipContent, onTooltipOpen) {
    const marker = L.marker(latlng, {
        icon: L.icon({
            iconUrl: iconUrl,
            shadowUrl: '/static/img/level_staff_shadow.png',
            shadowSize: [46, 66],
            shadowAnchor: [0, 66],
            iconSize: [10, 121],
            iconAnchor: [5, 121],
            tooltipAnchor: [0, -121]
        })
    }).bindTooltip(tooltipContent);

    marker.on('tooltipopen', function() {
        onTooltipOpen(feature, marker);
    });

    return marker;
}

async function initLevelMap() {
    const [wsvData, nlwknData] = await Promise.all([fetchWsvStations(), fetchNlwknData()]);
    const wsvGeojson = createWsvGeoJSON(wsvData);
    const nlwknGeojson = createGeoJSONFromNLWKN(nlwknData);

    var wsvLevelMeasurements = L.geoJSON(wsvGeojson, {
        attribution: '&copy; <a href="https://pegelonline.wsv.de/">WSV</a>',
        pointToLayer: function(feature, latlng) {
            const tooltipContent = `
                <strong>${feature.properties.longname}</strong><br>
                <strong>${feature.properties.water.longname}</strong> (km ${feature.properties.km})
            `;
            return createMarker(feature, latlng, '/static/img/level_staff_yellow.svg', tooltipContent, onWsvTooltipOpen);
        }
    });

    var nlwknLevelMeasurements = L.geoJSON(nlwknGeojson, {
        attribution: '&copy; <a href="https://www.pegelonline.nlwkn.niedersachsen.de/">NLWKN</a>',
        pointToLayer: function(feature, latlng) {
            const tooltipContent = `
                <strong>${feature.properties.Name}</strong><br>
                <strong>${feature.properties.GewaesserName}</strong><br>
                <strong>${feature.properties.AktuellerMesswert} ${feature.properties.Einheit}</strong> (${feature.properties.time})<br>
                <strong>${feature.properties.AktuellerMesswertNNM} m+NN</strong>
            `;
            return createMarker(feature, latlng, '/static/img/level_staff_white.svg', tooltipContent, onNlwknTooltipOpen);
        }
    });

    var levelMeasurementsGroup = L.layerGroup([wsvLevelMeasurements, nlwknLevelMeasurements]);
    levelMeasurementsGroup.addTo(map);
    layerControl.addOverlay(levelMeasurementsGroup, "water level stations");

    map.on('zoomend', function() {
        if (map.getZoom() >= 10) {
            if (!levelMeasurementsGroup.hasLayer(wsvLevelMeasurements)) {
                levelMeasurementsGroup.addLayer(wsvLevelMeasurements);
            }
            if (!levelMeasurementsGroup.hasLayer(nlwknLevelMeasurements)) {
                levelMeasurementsGroup.addLayer(nlwknLevelMeasurements);
            }
        } else {
            if (levelMeasurementsGroup.hasLayer(wsvLevelMeasurements)) {
                levelMeasurementsGroup.removeLayer(wsvLevelMeasurements);
            }
            if (levelMeasurementsGroup.hasLayer(nlwknLevelMeasurements)) {
                levelMeasurementsGroup.removeLayer(nlwknLevelMeasurements);
            }
        }
    });
}

initLevelMap();
