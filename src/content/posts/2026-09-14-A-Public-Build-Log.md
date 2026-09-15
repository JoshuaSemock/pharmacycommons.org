---
title: A Public Build Log
slug: A-Public-Build-Log
date: 2026-09-14
author: Joshua Semock, PharmD
summary: Why the work on Pharmacy Commons gets written down in the open, including the parts that go wrong.
tags: [meta, process, architecture]
draft: false
---

*Updated September 15, 2026, to reflect the white paper draft and where the build
actually stands.*

Most reference platforms present themselves as finished. The data is simply there,
the classifications are simply correct, and the reader has no way to tell which
fields were pulled from a regulatory filing and which were somebody's judgment call
at 2am.

That opacity is a problem for a project like this one. If the argument is that
public drug data should be restructured in the open, then the restructuring itself
has to be legible, including the decisions that turned out to be wrong.

## What goes here

- **Architecture, one piece at a time.** A white paper draft now describes the whole
  design: permanent identifiers, the line between a drug and its salts, how sourced
  claims become published facts, and where environmental data fits. Posts here take
  it apart section by section, and say so when the design moves.
- **Open decisions, as they close.** The draft lists questions that still need an
  answer: how to handle prodrugs and single enantiomers, what every reader must see
  regardless of view, how community contributions are licensed. When one gets
  decided, the decision and the reasoning land here.
- **Environmental methodology.** Every risk quotient on this site is a calculation
  with assumptions baked into it. Those assumptions get stated. The first of these
  posts covers [what a risk quotient actually tells you](/blog/what-a-risk-quotient-tells-you).
- **Corrections.** When a field is wrong and gets fixed, the fix is described rather
  than quietly applied. The database is being designed to keep both the wrong value
  and the fix, so a correction becomes part of the record instead of an erasure.
- **Occasional argument.** There are real positions embedded in this project about
  access, licensing, and what prescribers should be able to see for free.

## Where things actually stand

The live site runs on a static list of 3,433 permanent drug identifiers that ships
with the page. Search, browsing, and links work without a database behind them.

The database itself is, at the moment, empty. Earlier status notes described data as
loaded that was not actually there. The database has since been cleared, the schema
rebuilt, and the new version is waiting to be deployed.

That is exactly the kind of thing this log exists to say out loud. The lesson is
already part of how the project works: progress is checked against the system itself,
never against a report about the system.

## One record, several ways to read it

The design has also settled how the site will present information. Every drug has one
underlying record. Patients, clinicians, researchers, and educators will each get a
view of it suited to what they need. Software gets a machine-readable view. A sixth
view, Commons, is where contributors review and improve the record. The views change
what is shown and how it is explained. They never change the facts.

The Commons view is, in a sense, this log made permanent. Eventually every record will
carry its own history: which source said what, what was disputed, what was corrected,
and who approved the change. Until that exists, this page is where that history lives.

## What does not go here

Clinical guidance. Nothing on this site is medical advice, and a blog post is an
even worse place to look for it than a monograph. If a post touches something
clinical, it is describing how the data is *structured*, not telling anyone what to
do with a patient. The Patient view will not change that either: it will explain a
medicine in plain language and leave decisions to the patient's pharmacist and
prescriber.

> The fastest way to lose trust in a reference is to discover it was confident about
> something it had no basis for.

## Coming up

Why every drug gets an identifier that is never reused, even after the record behind it
is merged or retired. Why metformin and metformin hydrochloride are one drug but two
substances. And how a single record can serve a patient and a researcher without
turning into two different truths.
