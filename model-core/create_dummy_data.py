import os
import json
import numpy as np
import SimpleITK as sitk
from pathlib import Path

# Paths
PROJECT_DIR = Path(__file__).resolve().parent
JSON_PATH = PROJECT_DIR / "example.json"
DATA_DIR = PROJECT_DIR / "samples"

def main():
    if not JSON_PATH.exists():
        print(f"Error: {JSON_PATH} not found.")
        return

    # Create the samples directory if it doesn't exist
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(JSON_PATH, "r") as f:
        data = json.load(f)

    # We will generate a small 3D volume of random noise for each entry
    # Shape is arbitrary (but large enough to satisfy cropping), e.g., (160, 320, 320)
    # To save time and disk space, let's keep it smaller but enough for center_crop to work
    shape = (160, 320, 320)
    
    print(f"Generating dummy .mha files in {DATA_DIR}...")
    
    for item in data.get("training", []):
        filename = item.get("image")
        if not filename:
            continue
            
        file_path = DATA_DIR / filename
        
        # Only create if it doesn't exist yet
        if file_path.exists():
            continue
            
        print(f"Creating {filename}...")
        # Generate random data
        dummy_data = np.random.randn(*shape).astype(np.float32)
        # Convert to SimpleITK Image
        image = sitk.GetImageFromArray(dummy_data)
        # Save as .mha
        sitk.WriteImage(image, str(file_path))
        
    print("Done! Dummy dataset generation complete.")

if __name__ == "__main__":
    main()
