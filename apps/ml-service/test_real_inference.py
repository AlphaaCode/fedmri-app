import numpy as np, SimpleITK as sitk, tempfile, os
from real_inference import verify_volume


def _mha_bytes(shape=(32, 64, 64)):
    img = sitk.GetImageFromArray(np.random.rand(*shape).astype("float32"))
    with tempfile.NamedTemporaryFile(suffix=".mha", delete=False) as t:
        sitk.WriteImage(img, t.name); p = t.name
    b = open(p, "rb").read(); os.unlink(p); return b


def test_valid_volume_passes():
    assert verify_volume(_mha_bytes(), "x.mha")["valid"] is True


def test_png_rejected():
    assert verify_volume(b"\x89PNG\r\n", "photo.png")["valid"] is False
