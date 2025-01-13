function isValidLatLng(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function fetchWsvStations() {
    try {
        const response = await fetch('https://pegelonline.wsv.de/webservices/rest-api/v2/stations.json?includeTimeseries=true');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching WSV data:', error);
        return [];
    }
}

async function fetchNlwknData() {
    try {
        const response = await fetch('https://bis.azure-api.net/PegelonlinePublic/REST/stammdaten/stationen/All?key=9dc05f4e3b4a43a9988d747825b39f43');
        const data = await response.json();
        return data.getStammdatenResult;
    } catch (error) {
        console.error('Error fetching NLWKN data:', error);
        return [];
    }
}

async function fetchNlwknStationData(sta_id) {
    try {
        const url = `https://bis.azure-api.net/PegelonlinePublic/REST/station/${sta_id}/datenspuren/parameter/1/tage/-1?key=9dc05f4e3b4a43a9988d747825b39f43`;
        const response = await fetch(url);
        const data = await response.json();
        return data.getPegelDatenspurenResult;
    } catch (error) {
        console.error('Error fetching NLWKN station data:', error);
        return null;
    }
}

function createWsvGeoJSON(data) {
    return {
        type: "FeatureCollection",
        features: data
            .filter(station => isValidLatLng(station.latitude, station.longitude))
            .map(station => {
                const series = station.timeseries.find(series => series.shortname === 'W');
                if (!series) {
                    return null;
                }
                return {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [station.longitude, station.latitude]
                    },
                    properties: {
                        uuid: station.uuid,
                        number: station.number,
                        shortname: station.shortname,
                        longname: station.longname,
                        km: station.km,
                        agency: station.agency,
                        water: station.water,
                        timeseries: station.timeseries,
                        unit: series.unit,
                        gaugeZero: series.gaugeZero
                    }
                };
            }).filter(feature => feature !== null)
    };
}

function createGeoJSONFromNLWKN(data) {
    return {
        type: "FeatureCollection",
        features: data
            .filter(station => station.Parameter[0].Name === 'Wasserstand')
            .map(station => {
                const datenspur = station.Parameter[0].Datenspuren[0];
                return {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [parseFloat(station.Latitude), parseFloat(station.Longitude)]
                    },
                    properties: {
                        GewaesserName: station.GewaesserName,
                        Hoehe: station.Hoehe,
                        Name: station.Name,
                        AktuellerMesswert: datenspur.AktuellerMesswert,
                        AktuellerMesswertNNM: datenspur.AktuellerMesswertNNM,
                        AktuellerMesswert_Zeitpunkt: datenspur.AktuellerMesswert_Zeitpunkt,
                        time: datenspur.AktuellerMesswert_Zeitpunkt.split(' ')[1],
                        Einheit: datenspur.ParameterEinheit,
                        STA_ID: station.STA_ID
                    }
                };
            })
    };
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

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
