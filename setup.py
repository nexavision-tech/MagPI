# setup.py
from setuptools import setup, find_packages

setup(
    name="magpi",
    version="1.0.0",
    author="Christopher Hanni & MagPI Team US",
    description="An open-source, sovereign, drop-in replacement for arcpy.",
    long_description="MagPI (Map Algebra & Geospatial Python Interface) intercepts proprietary ESRI arcpy calls and reroutes them through high-speed, open-source C-backends like GeoPandas, Rasterio, and PySAL.",
    packages=find_packages(),
    install_requires=[
        "geopandas",
        "rasterio",
        "pandas",
        "numpy",
        "scipy",
        "laspy[lazrs]",
        "rasterstats",
        "libpysal",
        "esda",
        "requests"
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "Operating System :: POSIX :: Linux",
        "Topic :: Scientific/Engineering :: GIS",
    ],
    python_requires='>=3.8',
)