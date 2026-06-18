import requests

s, w, n, e = 37.7749, -122.4194, 37.7750, -122.4190

query = f"""
[out:json];
way["building"]({s},{w},{n},{e});
out geom;
"""

r = requests.post("http://overpass-api.de/api/interpreter", data={'data': query})
print(r.json())
