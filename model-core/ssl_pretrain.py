"""
SimMIM self-supervised pretraining with LoRA adapters on DINOv2-S/14.

- Backbone: frozen DINOv2-S, LoRA r=4 on last 2 blocks (~150K trainable).
- Task: 40% random patch masking, L1 reconstruction of masked patches only.
- Data: all non-background 2D axial slices from the 737 volumes.

Usage:
    python ssl_pretrain.py --epochs 50 --out checkpoints/dinov2s_simmim_lora.pt
"""
from __future__ import annotations
import argparse
import math
import os
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torch.amp import autocast, GradScaler

from config import CFG
from data_loader import MRISSLSliceDataset, load_samples


class SimMIMLoRA(nn.Module):
    """
    SimMIM head on top of a timm DINOv2-S with LoRA adapters.

    Recon strategy: linear decoder on patch tokens -> predict pixel patches.
    """

    def __init__(self, lora_rank: int = 4, patch_size: int = 14, img_size: int = 224):
        super().__init__()
        import timm
        self.backbone = timm.create_model(
            "vit_small_patch14_dinov2.lvd142m",
            pretrained=True, num_classes=0, global_pool="",
        )
        self.backbone.set_input_size(img_size=img_size)  # timm ViT helper
        self.feat_dim = self.backbone.num_features
        self.patch_size = patch_size
        self.img_size = img_size
        self.num_patches = (img_size // patch_size) ** 2
        self.mask_token = nn.Parameter(torch.zeros(1, 1, self.feat_dim))
        nn.init.trunc_normal_(self.mask_token, std=0.02)
        self.decoder = nn.Linear(self.feat_dim, 3 * patch_size * patch_size)

        # freeze backbone, then inject LoRA
        for p in self.backbone.parameters():
            p.requires_grad_(False)
        try:
            from peft import LoraConfig, get_peft_model
            n_blocks = len(self.backbone.blocks)
            keep = range(max(0, n_blocks - 2), n_blocks)
            targets = []
            for i in keep:
                for sub in ("attn.qkv", "mlp.fc1", "mlp.fc2"):
                    targets.append(f"blocks.{i}.{sub}")
            cfg = LoraConfig(r=lora_rank, lora_alpha=2 * lora_rank,
                             lora_dropout=0.0, bias="none",
                             target_modules=targets)
            get_peft_model(self.backbone, cfg)
        except Exception as e:
            print(f"[WARN] LoRA injection failed: {e}")

    def _patchify(self, img: torch.Tensor) -> torch.Tensor:
        B, C, H, W = img.shape
        p = self.patch_size
        x = img.reshape(B, C, H // p, p, W // p, p)
        x = x.permute(0, 2, 4, 1, 3, 5).reshape(B, (H // p) * (W // p), C * p * p)
        return x  # (B, N, C*p*p)

    def forward(self, img: torch.Tensor):
        B = img.size(0)
        # Run backbone patch embed + blocks manually to inject mask tokens
        x = self.backbone.patch_embed(img)                # (B, N, D)
        cls = self.backbone.cls_token.expand(B, -1, -1)   # (B, 1, D)
        # mask
        N = x.size(1)
        mask = torch.rand(B, N, device=x.device) < 0.4
        x = torch.where(mask.unsqueeze(-1), self.mask_token.expand(B, N, -1), x)
        x = torch.cat([cls, x], dim=1)
        # Not all timm ViTs expose pos_embed in a uniform way, guard it:
        if hasattr(self.backbone, "_pos_embed"):
            x = self.backbone._pos_embed(x) if False else x  # already added in patch_embed path
        if getattr(self.backbone, "pos_embed", None) is not None:
            x = x + self.backbone.pos_embed
        x = self.backbone.pos_drop(x) if hasattr(self.backbone, "pos_drop") else x
        for blk in self.backbone.blocks:
            x = blk(x)
        x = self.backbone.norm(x)
        tokens = x[:, 1:, :]                              # (B, N, D)

        pred = self.decoder(tokens)                       # (B, N, C*p*p)
        target = self._patchify(img)                      # (B, N, C*p*p)

        loss = (pred - target).abs()
        loss = loss.mean(dim=-1)                          # (B, N)
        loss = (loss * mask.float()).sum() / mask.float().sum().clamp_min(1.0)
        return loss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=CFG.ssl.epochs)
    ap.add_argument("--batch", type=int, default=CFG.ssl.batch_size)
    ap.add_argument("--lr", type=float, default=CFG.ssl.lr)
    ap.add_argument("--out", type=str, default=CFG.ssl_ckpt)
    ap.add_argument("--json", type=str, default=CFG.data_json)
    ap.add_argument("--root", type=str, default=CFG.data_root)
    ap.add_argument("--slice-size", type=int, default=CFG.ssl.slice_size)
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    samples = load_samples(args.json, args.root)
    ds = MRISSLSliceDataset(samples, slice_size=args.slice_size, augment=True)
    print(f"SSL dataset: {len(ds):,} usable slices from {len(samples)} volumes")
    loader = DataLoader(ds, batch_size=args.batch, shuffle=True,
                        num_workers=CFG.ssl.num_workers, pin_memory=True, drop_last=True)

    model = SimMIMLoRA(lora_rank=CFG.ssl.lora_rank,
                       img_size=args.slice_size).to(device)
    train_params = [p for p in model.parameters() if p.requires_grad]
    n_train = sum(p.numel() for p in train_params)
    print(f"SSL trainable params: {n_train:,}")

    opt = torch.optim.AdamW(train_params, lr=args.lr,
                            weight_decay=CFG.ssl.weight_decay, betas=(0.9, 0.95))
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(
        opt, T_max=args.epochs * max(1, len(loader)), eta_min=1e-6)
    scaler = GradScaler("cuda", enabled=device.type == "cuda")

    os.makedirs(Path(args.out).parent, exist_ok=True)

    best_loss = math.inf
    for ep in range(args.epochs):
        model.train()
        t0 = time.time()
        losses = []
        for i, x in enumerate(loader):
            x = x.to(device, non_blocking=True)
            opt.zero_grad(set_to_none=True)
            with autocast("cuda", enabled=device.type == "cuda"):
                loss = model(x)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(train_params, 1.0)
            scaler.step(opt)
            scaler.update()
            sched.step()
            losses.append(loss.item())
            if i % 50 == 0:
                print(f"  ep{ep} step {i}/{len(loader)}  loss={loss.item():.4f}")
        mean_loss = sum(losses) / max(1, len(losses))
        dur = time.time() - t0
        print(f"[SSL] epoch {ep}  loss={mean_loss:.4f}  ({dur:.1f}s)")
        if mean_loss < best_loss:
            best_loss = mean_loss
            # Save only LoRA/trainable deltas + mask token + decoder
            sd = {k: v for k, v in model.state_dict().items()
                  if ("lora" in k.lower()) or ("mask_token" in k) or ("decoder" in k)}
            torch.save({"state_dict": sd, "loss": best_loss, "epoch": ep}, args.out)
            print(f"  -> saved {args.out} ({len(sd)} tensors)")

        # Go/no-go per plan: abort if loss not under 0.30 by epoch 20
        if ep == 20 and mean_loss > 0.30:
            print("[SSL] loss above 0.30 at epoch 20 — abandoning SSL per plan")
            break


if __name__ == "__main__":
    main()
