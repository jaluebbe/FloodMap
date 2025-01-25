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
