function isValidLatLng(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function fetchStations() {
    try {
        const response = await fetch('https://pegelonline.wsv.de/webservices/rest-api/v2/stations.json?includeTimeseries=true');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

function createGeoJSON(data) {
    return {
        type: "FeatureCollection",
        features: data
            .filter(station => isValidLatLng(station.latitude, station.longitude))
            .map(station => ({
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
                    timeseries: station.timeseries
                }
            }))
    };
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

async function onTooltipOpen(feature, marker) {
    const uuid = feature.properties.uuid;
    const url = `https://pegelonline.wsv.de/webservices/rest-api/v2/stations/${uuid}/W/measurements.json?start=PT3H`;

    try {
        const response = await fetch(url);
        const measurements = await response.json();

        if (measurements.length > 0) {
            const lastMeasurement = measurements[measurements.length - 1];
            const value = lastMeasurement.value;
            const time = formatTime(lastMeasurement.timestamp);

            const series = feature.properties.timeseries.find(series => series.shortname === 'W');
            const unit = series.unit;

            let tooltipContent = `
                <strong>${feature.properties.longname}</strong><br>
                <strong>${feature.properties.water.longname}</strong> (km ${feature.properties.km})<br>
                <strong>${value} ${unit}</strong> (${time})
            `;

            if (series.gaugeZero && (series.gaugeZero.unit === 'm. ü. NN' || series.gaugeZero.unit === 'm. ü. NHN') && unit === 'cm') {
                const gaugeZeroValue = series.gaugeZero.value;
                const adjustedValue = (value / 100) + gaugeZeroValue;
                tooltipContent += `<br><strong>${adjustedValue.toFixed(2)} ${series.gaugeZero.unit}</strong>`;
            }

            marker.setTooltipContent(tooltipContent);
        }
    } catch (error) {
        console.error('Error fetching measurements:', error);
    }
}

async function initMap() {
    const data = await fetchStations();
    const geojson = createGeoJSON(data);

    var levelMeasurements = L.geoJSON(geojson, {
        pointToLayer: function(feature, latlng) {
            const marker = L.marker(latlng, {
                icon: L.icon({
                    iconUrl: '/static/img/level_staff_yellow.svg',
                    shadowUrl: '/static/img/level_staff_shadow.png',
                    shadowSize: [46, 66],
                    shadowAnchor: [0, 66],
                    iconSize: [10, 121],
                    iconAnchor: [5, 121],
                    tooltipAnchor: [0, -121]
                })
            }).bindTooltip(`
                <strong>${feature.properties.longname}</strong><br>
                <strong>${feature.properties.water.longname}</strong> (km ${feature.properties.km})
            `);

            marker.on('tooltipopen', function() {
                onTooltipOpen(feature, marker);
            });

            return marker;
        }
    });

    var levelMeasurementsGroup = L.layerGroup([levelMeasurements]);
    levelMeasurementsGroup.addTo(map);
    layerControl.addOverlay(levelMeasurementsGroup, "water level stations");

    map.on('zoomend', function() {
        if (map.getZoom() >= 10) {
            if (!levelMeasurementsGroup.hasLayer(levelMeasurements)) {
                levelMeasurementsGroup.addLayer(levelMeasurements);
            }
        } else {
            if (levelMeasurementsGroup.hasLayer(levelMeasurements)) {
                levelMeasurementsGroup.removeLayer(levelMeasurements);
            }
        }
    });
}

initMap();
