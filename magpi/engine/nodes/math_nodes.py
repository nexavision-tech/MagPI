from ..node import Node
from .registry import register_node
import logging
import geopandas as gpd

logger = logging.getLogger("MagPI_MathNodes")

@register_node('logic_constant')
class ConstantNode(Node):
    def execute(self):
        p = self.params
        val_str = p.get('value', '0')
        val_type = p.get('type', 'float')
        
        try:
            if val_type == 'float':
                self.output = float(val_str)
            elif val_type == 'integer':
                self.output = int(val_str)
            else:
                self.output = str(val_str)
            logger.info(f"Constant Output: {self.output}")
        except ValueError:
            logger.error(f"Failed to parse constant value '{val_str}' as {val_type}")
            raise

@register_node('logic_math')
class MathNode(Node):
    def execute(self):
        p = self.params
        
        # In a dual-input scenario (IN 1, IN 2), pipeline.py passes inputs differently based on how they were appended.
        # But for logic_math, we probably just expect 'in' to be a list if multiple things connected,
        # OR we rely on params if they are passed directly, OR we rely on specific handles 'A' and 'B'.
        # Since we use 'A' and 'B' as handles in the UI (or topLbl/botLbl), let's extract them:
        var_a = self.inputs.get("A", p.get("value_a", 0.0))
        var_b = self.inputs.get("B", p.get("value_b", 0.0))
        
        op = p.get("operator", "+")
        
        try:
            a = float(var_a)
            b = float(var_b)
            
            if op == '+': self.output = a + b
            elif op == '-': self.output = a - b
            elif op == '*': self.output = a * b
            elif op == '/': 
                if b == 0: raise ValueError("Division by zero")
                self.output = a / b
            else:
                raise ValueError(f"Unknown operator: {op}")
                
            logger.info(f"Math Result: {a} {op} {b} = {self.output}")
        except Exception as e:
            logger.error(f"Math operation failed: {e}")
            raise

@register_node('logic_extract_attr')
class ExtractAttributeNode(Node):
    def execute(self):
        in_file = self.inputs.get("in")
        p = self.params
        
        col = p.get("column", "")
        stat = p.get("statistic", "first")
        
        if not in_file:
            raise ValueError("Input feature class is required for Extract Attribute.")
            
        if not col:
            raise ValueError("Column name is required.")
            
        logger.info(f"Extracting {stat} of column '{col}' from {in_file}")
        
        try:
            gdf = gpd.read_file(in_file)
            if col not in gdf.columns:
                raise ValueError(f"Column '{col}' not found in {in_file}")
                
            series = gdf[col]
            
            if stat == 'first': self.output = series.iloc[0]
            elif stat == 'max': self.output = series.max()
            elif stat == 'min': self.output = series.min()
            elif stat == 'mean': self.output = series.mean()
            elif stat == 'sum': self.output = series.sum()
            else:
                self.output = series.iloc[0]
                
            logger.info(f"Extracted Value: {self.output}")
        except Exception as e:
            logger.error(f"Attribute extraction failed: {e}")
            raise
