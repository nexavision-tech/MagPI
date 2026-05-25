import os
import logging
import numpy as np
import rasterio
from .objects import Result

logger = logging.getLogger("MagPI_ML")

def PyTorchInference(in_raster, model_script_path, out_raster, tile_size=256, batch_size=4, device="cuda"):
    """
    Executes a compiled PyTorch model against a target raster natively.
    Tiles the raster, performs batched inference on the GPU/CPU, and stitches it back.
    """
    logger.info(f"Initiating PyTorch Deep Learning Inference on: {in_raster}")
    
    if hasattr(in_raster, 'name'): raster_path = in_raster.name
    elif hasattr(in_raster, 'output'): raster_path = in_raster.output
    else: raster_path = str(in_raster)
        
    try:
        import torch
        import importlib.util
        
        # 1. Load the dynamic model script
        if not os.path.exists(model_script_path):
            raise FileNotFoundError(f"Model script not found: {model_script_path}")
            
        spec = importlib.util.spec_from_file_location("dynamic_model", model_script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        
        # Instantiate model and move to device
        device = torch.device(device if torch.cuda.is_available() else "cpu")
        logger.info(f"Compiling PyTorch graph to device: {device}")
        model = mod.DynamicModel().to(device)
        model.eval()
        
        # 2. Tile and infer
        with rasterio.open(raster_path) as src:
            meta = src.meta.copy()
            meta.update(count=1, dtype='float32') # Output is a single band probability or logit mask
            
            with rasterio.open(out_raster, 'w', **meta) as dest:
                # Calculate grid
                height, width = src.height, src.width
                
                batch_tiles = []
                batch_windows = []
                
                logger.info(f"Tiling raster ({width}x{height}) into {tile_size}x{tile_size} chunks...")
                
                with torch.no_grad():
                    for y in range(0, height, tile_size):
                        for x in range(0, width, tile_size):
                            # Read window
                            window = rasterio.windows.Window(x, y, tile_size, tile_size)
                            # Clip window to edge of raster if necessary
                            actual_w = min(tile_size, width - x)
                            actual_h = min(tile_size, height - y)
                            clip_window = rasterio.windows.Window(x, y, actual_w, actual_h)
                            
                            chip = src.read(window=clip_window).astype('float32')
                            
                            # Pad if necessary to match tile_size for the network
                            if actual_w < tile_size or actual_h < tile_size:
                                padded = np.zeros((src.count, tile_size, tile_size), dtype='float32')
                                padded[:, :actual_h, :actual_w] = chip
                                chip = padded
                                
                            batch_tiles.append(chip)
                            batch_windows.append(clip_window)
                            
                            # Process batch
                            if len(batch_tiles) == batch_size or (y + tile_size >= height and x + tile_size >= width):
                                # Convert to tensor [B, C, H, W]
                                tensor_batch = torch.tensor(np.stack(batch_tiles)).to(device)
                                
                                # Forward pass
                                preds = model(tensor_batch) # [B, 1, H, W] or similar
                                
                                # Move to CPU
                                preds_np = preds.squeeze(1).cpu().numpy() # [B, H, W]
                                
                                # Write to disk
                                for i, (pred, win) in enumerate(zip(preds_np, batch_windows)):
                                    # Crop padded predictions back to original edge dimensions
                                    dest.write(pred[:win.height, :win.width], 1, window=win)
                                    
                                batch_tiles = []
                                batch_windows = []
                                
        logger.info(f"SUCCESS: Deep Learning inference saved to: {out_raster}")
        return Result(out_raster)
        
    except Exception as e:
        logger.error(f"PyTorch Inference Engine Failed: {e}")
        import traceback
        traceback.print_exc()
        return Result(None, status=3)
