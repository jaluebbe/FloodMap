import base64
import json
import math
from io import BytesIO
from pathlib import Path
from typing import Annotated

import matplotlib
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np
import rasterio
import requests
from fastapi import APIRouter, Query
from PIL import Image
from pydantic import BaseModel
from pyproj import Transformer

router = APIRouter(prefix="/api")

matplotlib.use("Agg")

dgm1_tiles_dir = Path("dgm1_tiles")
tile_dict_path = dgm1_tiles_dir / "tile_dict.json"
with tile_dict_path.open("r") as file:
    dgm1_tile_dict = json.load(file)


class Tile(BaseModel):
    rasterImage: str
    bounds: list[float]
    crs: str


class DGM1Data(BaseModel):
    bbox: list[float]
    terrain: dict | None = None
    custom: dict | None = None


def round_down_to_1000(value):
    return math.floor(value / 1000) * 1000


def round_up_to_1000(value):
    return math.ceil(value / 1000) * 1000


transformer_to_epsg25832 = Transformer.from_crs(
    "EPSG:4326", "EPSG:25832", always_xy=True
)
transformer_to_wgs84 = Transformer.from_crs(
    "EPSG:25832", "EPSG:4326", always_xy=True
)


def convert_bounds_to_epsg25832(
    lat_min: float, lon_min: float, lat_max: float, lon_max: float
) -> tuple[tuple[float, float], tuple[float, float]]:
    x_min, y_min = transformer_to_epsg25832.transform(lon_min, lat_min)
    x_max, y_max = transformer_to_epsg25832.transform(lon_max, lat_max)
    x_min = round_down_to_1000(x_min)
    y_min = round_down_to_1000(y_min)
    x_max = round_up_to_1000(x_max)
    y_max = round_up_to_1000(y_max)
    return (x_min, y_min), (x_max, y_max)


def convert_epsg25832_to_lon_lat(
    x_min: float, y_min: float, x_max: float, y_max: float
) -> tuple[tuple[float, float], tuple[float, float]]:
    lon_min, lat_min = transformer_to_wgs84.transform(x_min, y_min)
    lon_max, lat_max = transformer_to_wgs84.transform(x_max, y_max)
    return (
        (round(lon_min, 6), round(lat_min, 6)),
        (round(lon_max, 6), round(lat_max, 6)),
    )


def list_tile_ids(lower_left, upper_right) -> list[str]:
    x_min, y_min = lower_left
    x_max, y_max = upper_right
    return [
        f"32{x}{y}"
        for x in range(x_min // 1000, x_max // 1000)
        for y in range(y_min // 1000, y_max // 1000)
    ]


def get_geotiff_data(file_name: str, tile_id: str) -> dict:
    with rasterio.open(file_name) as src:
        return {
            "mosaic": src.read(1),
            "crs": src.crs,
            "bounds": src.bounds,
            "file_id": tile_id,
        }


def apply_custom_colorcode(rgba_img, data, level: float) -> np.ndarray:
    rgba_img[data < level - 1] = [0, 0, 255, 255]
    rgba_img[(data >= level - 1) & (data < level)] = [255, 0, 0, 255]
    rgba_img[(data >= level) & (data < level + 0.5)] = [255, 255, 0, 255]
    return rgba_img


def apply_custom_colormap(data, level: float) -> np.ndarray:
    rgba_img = np.zeros((data.shape[0], data.shape[1], 4), dtype=np.uint8)
    rgba_img[..., 3] = 255
    rgba_img = apply_custom_colorcode(rgba_img, data, level)
    rgba_img[data >= level + 0.5, 3] = 0
    return rgba_img


def apply_terrain_colormap(
    data, h_min: float = 10, h_max: float = 50
) -> np.ndarray:
    cmap = plt.get_cmap("terrain")
    norm = mcolors.Normalize(vmin=h_min, vmax=h_max)
    rgba_img = cmap(norm(data))
    return (rgba_img * 255).astype(np.uint8)


def process_tile_id(tile_id: str) -> dict | None:
    url = dgm1_tile_dict.get(tile_id)
    if url is None:
        return
    file_name = dgm1_tiles_dir / url.split("/")[-1]
    if file_name.exists():
        return get_geotiff_data(file_name, tile_id)
    response = requests.get(url)
    if response.status_code != 200:
        return
    with file_name.open("wb") as file:
        file.write(response.content)
    return get_geotiff_data(file_name, tile_id)


def create_terrain_colormap(z_min: float, z_max: float) -> str:
    terrain_cmap = plt.get_cmap("terrain")
    norm = mcolors.Normalize(vmin=z_min, vmax=z_max)
    fig, ax = plt.subplots(figsize=(1, 2.4))
    fig.subplots_adjust(right=0.5)
    cb = plt.colorbar(
        plt.cm.ScalarMappable(norm=norm, cmap=terrain_cmap),
        cax=ax,
        orientation="vertical",
    )
    colormap_buffer = BytesIO()
    fig.savefig(colormap_buffer, format="png", bbox_inches="tight")
    colormap_buffer.seek(0)
    colormap_base64 = base64.b64encode(colormap_buffer.getvalue()).decode(
        "utf-8"
    )
    plt.close(fig)
    return f"data:image/png;base64,{colormap_base64}"


def create_raster_image(
    data: np.ndarray,
    custom_level: float = None,
    z_min: float = None,
    z_max: float = None,
) -> str:
    if not None in (z_min, z_max):
        rgba_img = apply_terrain_colormap(data, z_min, z_max)
        if custom_level is not None:
            apply_custom_colorcode(rgba_img, data, custom_level)
    elif custom_level is not None:
        rgba_img = apply_custom_colormap(data, custom_level)
    else:
        raise ValueError(
            "Either z_min and z_max or custom_level must be provided."
        )
    img = Image.fromarray(rgba_img, "RGBA")
    img_buffer = BytesIO()
    img.save(img_buffer, format="PNG")
    img_base64 = base64.b64encode(img_buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{img_base64}"


def get_min_max_elevation(data) -> tuple[float, float]:
    z_min = np.inf
    z_max = -np.inf
    for tile_data in data:
        min_tile = np.min(tile_data["mosaic"])
        max_tile = np.max(tile_data["mosaic"])
        z_min = min(z_min, min_tile)
        z_max = max(z_max, max_tile)
    return z_min, z_max


def get_dgm1_tiles(
    lower_left_epsg25832: tuple[int, int],
    upper_right_epsg25832: tuple[int, int],
) -> list[dict]:
    tile_ids = list_tile_ids(lower_left_epsg25832, upper_right_epsg25832)
    return [
        data
        for tile_id in tile_ids
        if (data := process_tile_id(tile_id)) is not None
    ]


@router.get("/dgm1", response_model=DGM1Data)
def get_dgm1_data(
    lat_min: Annotated[float, Query(alias="lat_min")],
    lon_min: Annotated[float, Query(alias="lon_min")],
    lat_max: Annotated[float, Query(alias="lat_max")],
    lon_max: Annotated[float, Query(alias="lon_max")],
    terrain: Annotated[bool, Query(alias="terrain")] = False,
    custom: Annotated[bool, Query(alias="custom")] = False,
    custom_level: Annotated[float, Query(alias="custom_level")] = 19.2,
) -> DGM1Data:
    lower_left_epsg25832, upper_right_epsg25832 = convert_bounds_to_epsg25832(
        lat_min, lon_min, lat_max, lon_max
    )
    lon_lat_min, lon_lat_max = convert_epsg25832_to_lon_lat(
        *lower_left_epsg25832, *upper_right_epsg25832
    )
    bbox = [*lon_lat_min, *lon_lat_max]
    all_data = get_dgm1_tiles(lower_left_epsg25832, upper_right_epsg25832)
    dgm1_data = {
        "bbox": bbox,
    }
    if terrain:
        z_min, z_max = get_min_max_elevation(all_data)
        terrain_tiles = [
            {
                "rasterImage": create_raster_image(
                    data["mosaic"],
                    z_min=z_min,
                    z_max=z_max,
                    custom_level=custom_level if custom else None,
                ),
                "bounds": data["bounds"],
                "crs": data["crs"].to_string(),
            }
            for data in all_data
        ]
        dgm1_terrain_data = {
            "colormap": create_terrain_colormap(z_min, z_max),
            "tiles": terrain_tiles,
        }
        dgm1_data["terrain"] = dgm1_terrain_data
    if custom and not terrain:
        custom_tiles = [
            {
                "rasterImage": create_raster_image(
                    data["mosaic"], custom_level=custom_level
                ),
                "bounds": data["bounds"],
                "crs": data["crs"].to_string(),
            }
            for data in all_data
        ]
        dgm1_custom_data = {
            "level": custom_level,
            "tiles": custom_tiles,
        }
        dgm1_data["custom"] = dgm1_custom_data
    return dgm1_data


@router.get("/dgm1/terrain", response_model=DGM1Data)
def get_dgm1_terrain_data(
    lat_min: Annotated[float, Query(alias="lat_min")],
    lon_min: Annotated[float, Query(alias="lon_min")],
    lat_max: Annotated[float, Query(alias="lat_max")],
    lon_max: Annotated[float, Query(alias="lon_max")],
) -> DGM1Data:
    return get_dgm1_data(lat_min, lon_min, lat_max, lon_max, terrain=True)


@router.get("/dgm1/custom", response_model=DGM1Data)
def get_dgm1_custom_data(
    lat_min: Annotated[float, Query(alias="lat_min")],
    lon_min: Annotated[float, Query(alias="lon_min")],
    lat_max: Annotated[float, Query(alias="lat_max")],
    lon_max: Annotated[float, Query(alias="lon_max")],
    custom_level: Annotated[float, Query(alias="custom_level")] = 19.2,
) -> DGM1Data:
    return get_dgm1_data(
        lat_min,
        lon_min,
        lat_max,
        lon_max,
        custom=True,
        custom_level=custom_level,
    )
