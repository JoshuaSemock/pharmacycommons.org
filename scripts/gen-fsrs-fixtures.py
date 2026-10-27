import json
from datetime import datetime, timezone, timedelta
from fsrs import Scheduler, Card, Rating, State

NAMES = {State.Learning: 'learning', State.Review: 'review', State.Relearning: 'relearning'}
# scenario: list of (rating, delay): delay None = review exactly at due; else minutes after the previous review
SCEN = {
  'all-good': [(3, None)] * 7,
  'again-first-then-good': [(1, None), (3, None), (3, None), (3, None), (3, None)],
  'lapse-and-recover': [(3, None), (3, None), (3, None), (3, None), (1, None), (3, None), (3, None), (3, None)],
  'hard-and-easy-mix': [(2, None), (2, None), (3, None), (4, None), (3, None), (2, None), (4, None)],
  'late-reviews': [(3, None), (3, None), (3, None), (3, 60 * 24 * 40), (3, 60 * 24 * 90), (1, 60 * 24 * 200), (3, None)],
  'same-day-repeats': [(3, 1), (3, 5), (2, 20), (3, 30), (4, 60), (3, None), (3, None)],
  'easy-first': [(4, None), (3, None), (3, None), (3, None)],
}
sch = Scheduler(enable_fuzzing=False)
out = {}
t0 = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
for name, seq in SCEN.items():
    card = Card(); now = t0; rows = []
    for rating, delay in seq:
        if rows:
            now = card.due if delay is None else (card.last_review + timedelta(minutes=delay))
        card, _ = sch.review_card(card, Rating(rating), now)
        rows.append({'at': now.isoformat().replace('+00:00', 'Z'), 'rating': rating,
                     'state': NAMES[card.state], 'step': card.step if card.step is not None else 0,
                     'stability': card.stability, 'difficulty': card.difficulty,
                     'due': card.due.isoformat().replace('+00:00', 'Z')})
    out[name] = rows
ts = "// Generated from py-fsrs 5.1.0 (Scheduler(enable_fuzzing=False), default FSRS-5 parameters).\n// Regenerate with the script in docs/learn.md §4. Do not edit by hand.\n\nexport type FsrsFixtureRow = {\n  at: string\n  rating: 1 | 2 | 3 | 4\n  state: 'learning' | 'review' | 'relearning'\n  step: number\n  stability: number\n  difficulty: number\n  due: string\n}\n\nexport const FSRS_FIXTURES: Record<string, FsrsFixtureRow[]> = " + json.dumps(out, indent=2) + "\n"
open('/home/claude/pharmacycommons.org/src/learn/fsrs.fixtures.ts', 'w').write(ts)
print({k: len(v) for k, v in out.items()}); print(out['lapse-and-recover'][4])
