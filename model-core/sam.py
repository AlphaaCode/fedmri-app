"""
Adaptive Sharpness-Aware Minimization (Kwon et al., ICML 2021).

Usage:
    base = torch.optim.AdamW(param_groups)
    optim = ASAM(base, rho=0.05, adaptive=True)

    # training step
    loss = criterion(model(x), y); loss.backward()
    optim.first_step(zero_grad=True)
    criterion(model(x), y).backward()   # compute grads at perturbed weights
    optim.second_step(zero_grad=True)

Works with torch.cuda.amp.GradScaler: call scaler.unscale_ before first_step
and again before second_step.
"""
from __future__ import annotations
import torch


class ASAM(torch.optim.Optimizer):
    def __init__(self, base_optimizer: torch.optim.Optimizer, rho: float = 0.05,
                 adaptive: bool = True, eps: float = 1e-12):
        if rho < 0:
            raise ValueError("rho must be non-negative")
        self.base_optimizer = base_optimizer
        self.rho = rho
        self.adaptive = adaptive
        self.eps = eps
        self.param_groups = base_optimizer.param_groups
        self.defaults = base_optimizer.defaults
        self.state = base_optimizer.state

    @torch.no_grad()
    def _grad_norm(self) -> torch.Tensor:
        device = self.param_groups[0]["params"][0].device
        norms = []
        for group in self.param_groups:
            for p in group["params"]:
                if p.grad is None:
                    continue
                g = p.grad
                if self.adaptive:
                    g = torch.abs(p) * g
                norms.append(g.norm(p=2).to(device))
        if not norms:
            return torch.tensor(0.0, device=device)
        return torch.norm(torch.stack(norms), p=2)

    @torch.no_grad()
    def first_step(self, zero_grad: bool = False):
        grad_norm = self._grad_norm() + self.eps
        scale = self.rho / grad_norm
        for group in self.param_groups:
            for p in group["params"]:
                if p.grad is None:
                    continue
                e = p.grad * scale.to(p)
                if self.adaptive:
                    e = e * torch.pow(p, 2)
                self.state[p]["e_w"] = e
                p.add_(e)
        if zero_grad:
            self.zero_grad(set_to_none=True)

    @torch.no_grad()
    def second_step(self, zero_grad: bool = False):
        for group in self.param_groups:
            for p in group["params"]:
                if p.grad is None or "e_w" not in self.state[p]:
                    continue
                p.sub_(self.state[p]["e_w"])
                del self.state[p]["e_w"]
        self.base_optimizer.step()
        if zero_grad:
            self.zero_grad(set_to_none=True)

    def step(self, closure=None):
        raise RuntimeError("ASAM requires first_step + second_step; do not call step().")

    def zero_grad(self, set_to_none: bool = True):
        self.base_optimizer.zero_grad(set_to_none=set_to_none)

    def state_dict(self):
        return self.base_optimizer.state_dict()

    def load_state_dict(self, sd):
        self.base_optimizer.load_state_dict(sd)
