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

class BaseMathNode(Node):
    def get_operator(self):
        return "+"
        
    def execute(self):
        p = self.params
        
        # In the UI, the inputs are labeled 'a' and 'b'.
        var_a = self.inputs.get("a", p.get("value_a", 0.0))
        var_b = self.inputs.get("b", p.get("value_b", 0.0))
        
        op = self.get_operator()
        
        try:
            import numpy as np
            
            # Convert to numpy arrays for vectorized math if they are lists
            a = np.array(var_a, dtype=float) if isinstance(var_a, list) else float(var_a)
            b = np.array(var_b, dtype=float) if isinstance(var_b, list) else float(var_b)
            
            if op == '+': self.output = (a + b).tolist() if isinstance(a, np.ndarray) or isinstance(b, np.ndarray) else a + b
            elif op == '-': self.output = (a - b).tolist() if isinstance(a, np.ndarray) or isinstance(b, np.ndarray) else a - b
            elif op == '*': self.output = (a * b).tolist() if isinstance(a, np.ndarray) or isinstance(b, np.ndarray) else a * b
            elif op == '/': 
                # Handle division by zero safely for arrays
                if isinstance(b, np.ndarray):
                    with np.errstate(divide='ignore', invalid='ignore'):
                        res = np.true_divide(a, b)
                        res[~np.isfinite(res)] = 0  # Fill NaNs/Infs with 0
                        self.output = res.tolist()
                else:
                    if b == 0: raise ValueError("Division by zero")
                    self.output = a / b
            else:
                raise ValueError(f"Unknown operator: {op}")
                
            if isinstance(self.output, list):
                logger.info(f"Math Result: Element-wise {op} computed on arrays of length {len(self.output)}")
            else:
                logger.info(f"Math Result: {a} {op} {b} = {self.output}")
        except Exception as e:
            logger.error(f"Math operation failed: {e}")
            raise

@register_node('logic_math_add')
class MathAddNode(BaseMathNode):
    def get_operator(self): return "+"

@register_node('logic_math_sub')
class MathSubNode(BaseMathNode):
    def get_operator(self): return "-"

@register_node('logic_math_mul')
class MathMulNode(BaseMathNode):
    def get_operator(self): return "*"

@register_node('logic_math_div')
class MathDivNode(BaseMathNode):
    def get_operator(self): return "/"

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
