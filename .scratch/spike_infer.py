"""Feasibility spike: run the REAL DINOv2-MIL model on one sample .mha, time it.
Throwaway — not product code. Run with the Model/V2 venv python."""
import sys, os, time, glob

V2 = r"D:\study\BioInfo M2 (2026)\Memoir\Model\V2"
CKPT = os.path.join(V2, "checkpoints", "best_fold0.pt")
SAMPLES = r"D:\study\BioInfo M2 (2026)\Memoir\Datasets\breast-mri-molecular-cancer-subtype\samples"

os.chdir(V2)
sys.path.insert(0, V2)
# NOTE: do NOT force HF offline — timm needs to load DINOv2 at img_size=224
# (set_input_size -> pos_embed 257) to match the checkpoint. Forcing offline
# made timm fall back to torch.hub at 518px (pos_embed 1370 -> size mismatch).

def log(*a):
    print(*a, flush=True)

t0 = time.time()
import torch
log("torch", torch.__version__, "| cuda", torch.cuda.is_available(),
    "| threads", torch.get_num_threads())
for mod in ("timm", "peft", "SimpleITK", "monai"):
    try:
        m = __import__(mod)
        log(f"  {mod}: {getattr(m, '__version__', '?')}")
    except Exception as e:
        log(f"  {mod}: MISSING ({e})")

from config import CLASS_NAMES
from image_process import preprocess_raw, slice_view_transform
from model import Dinov2MILClassifier

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
log("device:", device)

sample = sorted(glob.glob(os.path.join(SAMPLES, "*.mha")))[0]
log("sample:", os.path.basename(sample))
log("ckpt:", CKPT, "exists:", os.path.exists(CKPT))

tb = time.time()
model = Dinov2MILClassifier(num_classes=4, lora_rank=4, freeze_backbone=True,
                            proj_dim=256, attn_dim=128)
log("build model: %.1fs" % (time.time() - tb))

sd = torch.load(CKPT, map_location=device)
if isinstance(sd, dict):
    log("ckpt arch:", sd.get("arch"), "| fold:", sd.get("fold"))
    log("ckpt results:", sd.get("results"))
    for k in ("model_state", "state_dict", "model_state_dict"):
        if k in sd:
            sd = sd[k]
            break
res = model.load_state_dict(sd, strict=False)
log("load_state_dict: missing=%d unexpected=%d" % (len(res.missing_keys), len(res.unexpected_keys)))
log("  sample missing:", res.missing_keys[:4])
log("  sample unexpected:", res.unexpected_keys[:4])
model.to(device).eval()

tp = time.time()
vol = preprocess_raw(sample)            # (64,128,128)
x = slice_view_transform(torch.from_numpy(vol)).unsqueeze(0).to(device)  # (1,64,3,224,224)
log("preprocess: %.1fs  slices tensor %s" % (time.time() - tp, tuple(x.shape)))

ti = time.time()
with torch.no_grad():
    logits = model(x)
    probs = torch.softmax(logits, -1)[0].cpu().numpy()
attn = model.last_attn[0].cpu().numpy()  # (S,)
infer_s = time.time() - ti
log("inference: %.1fs" % infer_s)

order = probs.argsort()[::-1]
log("PROBS: " + " | ".join("%s %.3f" % (CLASS_NAMES[i], probs[i]) for i in order))
log("PRED:", CLASS_NAMES[int(order[0])], "(%.1f%%)" % (100 * probs[order[0]]))
top = attn.argsort()[::-1][:6]
log("TOP ATTENDED SLICES:", top.tolist())
log("  weights:", [round(float(attn[i]), 4) for i in top])
log("TOTAL: %.1fs" % (time.time() - t0))
