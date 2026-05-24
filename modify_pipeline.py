import json

with open('/home/gda/MagPI/magpi_workspace/MagPI_Active_Pipeline_003.mpjx', 'r') as f:
    data = json.load(f)

new_node = {
    "id": "node_9999999999999",
    "toolId": "envi_glcm",
    "name": "GLCM Textural Features",
    "icon": "envi_glcm",
    "x": 1900,
    "y": 260,
    "color": "bg-pink-600",
    "border": "border-pink-500",
    "params": {
    "window_size": "9x9",
    "shift_x": 1,
    "shift_y": 1
    },
    "selected": False
}

data['nodes'].append(new_node)

new_connection = {
    "from": "node_1779544764647",
    "to": "node_9999999999999",
    "sourceHandle": "out",
    "targetHandle": "in"
}

data['connections'].append(new_connection)

with open('/home/gda/MagPI/magpi_workspace/MagPI_Active_Pipeline_003.mpjx', 'w') as f:
    json.dump(data, f, indent=2)

print("Pipeline JSON updated.")
