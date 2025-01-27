import json
import re
import requests
from pathlib import Path

file_name_pattern = re.compile(
    r"^dgm1_(?P<zone>\d{2})_(?P<easting>\d{3})_"
    r"(?P<northing>\d{4})_1_(?P<state>\w{2})_(?P<year>\d{4})\.tif$"
)
tiles_dir = Path("dgm1_tiles")
tiles_dir.mkdir(parents=True, exist_ok=True)


def request_nw_index():
    url = "https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/index.json"
    response = requests.get(url)
    data = response.json()
    base_url = "https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/"
    tile_dict = {
        f"{match.group('zone')}{match.group('easting')}{match.group('northing')}": base_url
        + file["name"]
        for dataset in data.get("datasets", [])
        for file in dataset.get("files", [])
        if (match := file_name_pattern.match(file["name"]))
    }
    return tile_dict


def request_ni_index():
    geojson_url = (
        "https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud"
        "/dgm1/lgln-opengeodata-dgm1.geojson"
    )
    response = requests.get(geojson_url)
    geojson_data = response.json()
    tile_dict = {
        feature["properties"]["tile_id"]: feature["properties"]["dgm1"]
        for feature in geojson_data["features"]
    }
    return tile_dict


tile_dict = {}
tile_dict.update(request_nw_index())
tile_dict.update(request_ni_index())
with open(tiles_dir / "tile_dict.json", "w") as json_file:
    json.dump(tile_dict, json_file, indent=4)
