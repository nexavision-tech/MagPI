import sys

_parameters = sys.argv[1:] if len(sys.argv) > 1 else []

def GetParameterAsText(index):
    try:
        return _parameters[index]
    except IndexError:
        return ""

def SetParameterAsText(index, value):
    # If the list is too short, extend it
    while len(_parameters) <= index:
        _parameters.append("")
    _parameters[index] = str(value)

def SetParameter(index, value):
    SetParameterAsText(index, value)

def GetParameterCount():
    return len(_parameters)

def GetArgumentCount():
    return GetParameterCount()

def CopyParameter(from_param, to_param):
    SetParameterAsText(to_param, GetParameterAsText(from_param))

def GetParameterValue(tool_name, index):
    return "" # Default value mock

class Parameter:
    def __init__(self, name, paramType, value):
        self.name = name
        self.parameterType = paramType
        self.value = value
        self.symbology = ""

def GetParameterInfo(tool_name=None):
    return [Parameter(f"param{i}", "String", val) for i, val in enumerate(_parameters)]
