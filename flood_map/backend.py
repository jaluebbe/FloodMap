#!python
import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from routers.flood_map import router as flood_map

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(flood_map)


@app.get("/", include_in_schema=False)
async def root(request: Request):
    return RedirectResponse("/static/flood_map.html")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
