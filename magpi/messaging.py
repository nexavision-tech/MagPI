import logging

logger = logging.getLogger("MagPI_Messaging")

_messages = []
_max_severity = 0

def AddMessage(message):
    global _max_severity
    _messages.append((0, str(message)))
    logger.info(f"ArcPy Message: {message}")

def AddWarning(message):
    global _max_severity
    if _max_severity < 1:
        _max_severity = 1
    _messages.append((1, str(message)))
    logger.warning(f"ArcPy Warning: {message}")

def AddError(message):
    global _max_severity
    _max_severity = 2
    _messages.append((2, str(message)))
    logger.error(f"ArcPy Error: {message}")

def AddIDMessage(message_type, message_ID, add_argument1=None, add_argument2=None):
    msg = f"ID: {message_ID}"
    if add_argument1: msg += f" Arg1: {add_argument1}"
    if add_argument2: msg += f" Arg2: {add_argument2}"
    
    if message_type.upper() == "ERROR":
        AddError(msg)
    elif message_type.upper() == "WARNING":
        AddWarning(msg)
    else:
        AddMessage(msg)

def GetMessageCount():
    return len(_messages)

def GetMessage(index):
    try:
        return _messages[index][1]
    except IndexError:
        return ""

def GetMessages(severity=None):
    if severity is None:
        return "\n".join([m[1] for m in _messages])
    else:
        return "\n".join([m[1] for m in _messages if m[0] == severity])

def GetMaxSeverity():
    return _max_severity

def GetSeverity(index):
    try:
        return _messages[index][0]
    except IndexError:
        return 0

def AddReturnMessage(index):
    AddMessage(f"Tool execution returned successfully. (Mocked index {index})")

def GetReturnCode(index):
    return 0

def SetSeverityLevel(severity_level):
    pass 

def GetSeverityLevel():
    return 2
