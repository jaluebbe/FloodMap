import json
import requests
from pathlib import Path

tiles_dir = Path("dgm1_tiles")
tiles_dir.mkdir(parents=True, exist_ok=True)

geojson_url = "https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud/dgm1/lgln-opengeodata-dgm1.geojson"
response = requests.get(geojson_url)
geojson_data = response.json()
tile_dict = {}
for feature in geojson_data["features"]:
    tile_id = feature["properties"]["tile_id"]
    dgm1_path = feature["properties"]["dgm1"]
    tile_dict[tile_id] = dgm1_path
with open(tiles_dir / "tile_dict.json", "w") as json_file:
    json.dump(tile_dict, json_file, indent=4)
