---
title: What a risk quotient actually tells you
slug: what-a-risk-quotient-tells-you
date: 2026-09-02
author: Joshua Semock, PharmD
summary: The eco-risk field on each monograph is one number standing in for a chain of estimates. Here is the chain, and where it is weakest.
tags: [methodology, environment]
draft: false
---

Every monograph on this site carries an environmental risk indicator. It is a single
value, which makes it look more authoritative than it is. This post unpacks what sits
behind it.

## The calculation

The risk quotient is a ratio:

```
RQ = PEC / PNEC
```

Where **PEC** is the predicted environmental concentration — roughly, how much of the
drug is expected to end up in surface water — and **PNEC** is the predicted no-effect
concentration, the threshold below which measurable harm to aquatic organisms is not
expected.

An RQ at or above 1 means predicted exposure has reached the level where effects are
anticipated. Below 1, the margin is the interesting part: an RQ of 0.9 and an RQ of
0.001 are both "under threshold" and mean very different things.

## Where PEC comes from

PEC is estimated from consumption rather than measured directly. The inputs are:

1. Defined daily dose and population served, which give total mass consumed.
2. The excreted fraction — how much leaves the body as parent compound rather than as
   metabolite.
3. Wastewater treatment removal rate, which varies enormously by compound and by
   plant.
4. Dilution into receiving water.

Each of those is a range, not a value. Stacking four ranges produces a PEC whose
uncertainty is wider than the tidy number suggests.

Where a **MEC** — a measured environmental concentration from actual sampling — is
available, it is shown alongside and should be trusted over the prediction. Measured
data exists for a small fraction of compounds, concentrated in the ones that drew
regulatory attention first.

## Where PNEC is weakest

PNEC is derived from ecotoxicity endpoints, typically the lowest reliable value across
tested species divided by an assessment factor to account for everything that was not
tested. That assessment factor is often 1000 when the underlying data is thin.

This is the honest limitation: for many drugs, the toxicity data covers a handful of
standard test organisms — a fish, a daphnid, an alga — over short exposures. Chronic,
low-dose, multi-generational effects are precisely what pharmaceuticals in surface
water produce, and precisely what standard acute testing is worst at capturing.

## How to read it

Treat the indicator as a *comparative* signal, not an absolute one. Between two
therapeutically interchangeable agents, a consistent order-of-magnitude difference in
RQ is meaningful and actionable. A 20% difference between two compounds with different
underlying data quality is noise.

The per-drug page shows which inputs were estimated and which were measured. Check
that before treating the number as settled.
