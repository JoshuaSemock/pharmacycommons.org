// Generated from py-fsrs 5.1.0 (Scheduler(enable_fuzzing=False), default FSRS-5 parameters).
// Regenerate with the script in docs/learn.md §4. Do not edit by hand.

export type FsrsFixtureRow = {
  at: string
  rating: 1 | 2 | 3 | 4
  state: 'learning' | 'review' | 'relearning'
  step: number
  stability: number
  difficulty: number
  due: string
}

export const FSRS_FIXTURES: Record<string, FsrsFixtureRow[]> = {
  "all-good": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 3,
      "state": "learning",
      "step": 1,
      "stability": 3.173,
      "difficulty": 5.282434422319005,
      "due": "2026-01-01T09:10:00Z"
    },
    {
      "at": "2026-01-01T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 4.466858064362218,
      "difficulty": 5.272967931287446,
      "due": "2026-01-05T09:10:00Z"
    },
    {
      "at": "2026-01-05T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 14.217284109332127,
      "difficulty": 5.263544986114632,
      "due": "2026-01-19T09:10:00Z"
    },
    {
      "at": "2026-01-19T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 43.72509406220378,
      "difficulty": 5.254165386489613,
      "due": "2026-03-04T09:10:00Z"
    },
    {
      "at": "2026-03-04T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 124.79655604607703,
      "difficulty": 5.244828933022869,
      "due": "2026-07-07T09:10:00Z"
    },
    {
      "at": "2026-07-07T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 328.4734410094181,
      "difficulty": 5.2355354272420715,
      "due": "2027-05-31T09:10:00Z"
    },
    {
      "at": "2027-05-31T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 805.6082939815602,
      "difficulty": 5.226284671587866,
      "due": "2029-08-14T09:10:00Z"
    }
  ],
  "again-first-then-good": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 1,
      "state": "learning",
      "step": 0,
      "stability": 0.40255,
      "difficulty": 7.1949,
      "due": "2026-01-01T09:01:00Z"
    },
    {
      "at": "2026-01-01T09:01:00Z",
      "rating": 3,
      "state": "learning",
      "step": 1,
      "stability": 0.5666983024925972,
      "difficulty": 7.176636167311107,
      "due": "2026-01-01T09:11:00Z"
    },
    {
      "at": "2026-01-01T09:11:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 0.7977815576897062,
      "difficulty": 7.158456348252584,
      "due": "2026-01-02T09:11:00Z"
    },
    {
      "at": "2026-01-02T09:11:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 2.735143264167272,
      "difficulty": 7.140360156361731,
      "due": "2026-01-05T09:11:00Z"
    },
    {
      "at": "2026-01-05T09:11:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 7.85531596513308,
      "difficulty": 7.122347206953576,
      "due": "2026-01-13T09:11:00Z"
    }
  ],
  "lapse-and-recover": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 3,
      "state": "learning",
      "step": 1,
      "stability": 3.173,
      "difficulty": 5.282434422319005,
      "due": "2026-01-01T09:10:00Z"
    },
    {
      "at": "2026-01-01T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 4.466858064362218,
      "difficulty": 5.272967931287446,
      "due": "2026-01-05T09:10:00Z"
    },
    {
      "at": "2026-01-05T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 14.217284109332127,
      "difficulty": 5.263544986114632,
      "due": "2026-01-19T09:10:00Z"
    },
    {
      "at": "2026-01-19T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 43.72509406220378,
      "difficulty": 5.254165386489613,
      "due": "2026-03-04T09:10:00Z"
    },
    {
      "at": "2026-03-04T09:10:00Z",
      "rating": 1,
      "state": "relearning",
      "step": 0,
      "stability": 4.22419477379555,
      "difficulty": 6.777925624571879,
      "due": "2026-03-04T09:20:00Z"
    },
    {
      "at": "2026-03-04T09:20:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 5.9466998079941344,
      "difficulty": 6.761579874009957,
      "due": "2026-03-10T09:20:00Z"
    },
    {
      "at": "2026-03-10T09:20:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 16.28816261401658,
      "difficulty": 6.745309313900619,
      "due": "2026-03-26T09:20:00Z"
    },
    {
      "at": "2026-03-26T09:20:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 40.90427469917509,
      "difficulty": 6.7291135983677846,
      "due": "2026-05-06T09:20:00Z"
    }
  ],
  "hard-and-easy-mix": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 2,
      "state": "learning",
      "step": 0,
      "stability": 1.18385,
      "difficulty": 6.488305268471453,
      "due": "2026-01-01T09:05:30Z"
    },
    {
      "at": "2026-01-01T09:05:30Z",
      "rating": 2,
      "state": "learning",
      "step": 0,
      "stability": 0.9942462110608663,
      "difficulty": 7.040501547390819,
      "due": "2026-01-01T09:11:00Z"
    },
    {
      "at": "2026-01-01T09:11:00Z",
      "rating": 3,
      "state": "learning",
      "step": 1,
      "stability": 1.3996711962933535,
      "difficulty": 7.022947947583929,
      "due": "2026-01-01T09:21:00Z"
    },
    {
      "at": "2026-01-01T09:21:00Z",
      "rating": 4,
      "state": "review",
      "step": 0,
      "stability": 3.3028809548849716,
      "difficulty": 6.524620932337415,
      "due": "2026-01-04T09:21:00Z"
    },
    {
      "at": "2026-01-04T09:21:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 9.219118430421359,
      "difficulty": 6.509440383359771,
      "due": "2026-01-13T09:21:00Z"
    },
    {
      "at": "2026-01-13T09:21:00Z",
      "rating": 2,
      "state": "review",
      "step": 0,
      "stability": 12.842016102958574,
      "difficulty": 7.058125691921462,
      "due": "2026-01-26T09:21:00Z"
    },
    {
      "at": "2026-01-26T09:21:00Z",
      "rating": 4,
      "state": "review",
      "step": 0,
      "stability": 69.66366043635196,
      "difficulty": 6.565318776759052,
      "due": "2026-04-06T09:21:00Z"
    }
  ],
  "late-reviews": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 3,
      "state": "learning",
      "step": 1,
      "stability": 3.173,
      "difficulty": 5.282434422319005,
      "due": "2026-01-01T09:10:00Z"
    },
    {
      "at": "2026-01-01T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 4.466858064362218,
      "difficulty": 5.272967931287446,
      "due": "2026-01-05T09:10:00Z"
    },
    {
      "at": "2026-01-05T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 14.217284109332127,
      "difficulty": 5.263544986114632,
      "due": "2026-01-19T09:10:00Z"
    },
    {
      "at": "2026-02-14T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 85.6756203750707,
      "difficulty": 5.254165386489613,
      "due": "2026-05-11T09:10:00Z"
    },
    {
      "at": "2026-05-15T09:10:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 238.04980018002365,
      "difficulty": 5.244828933022869,
      "due": "2027-01-08T09:10:00Z"
    },
    {
      "at": "2026-12-01T09:10:00Z",
      "rating": 1,
      "state": "relearning",
      "step": 0,
      "stability": 7.976937898191457,
      "difficulty": 6.771648171200476,
      "due": "2026-12-01T09:20:00Z"
    },
    {
      "at": "2026-12-01T09:20:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 11.229703554822915,
      "difficulty": 6.755331296924062,
      "due": "2026-12-12T09:20:00Z"
    }
  ],
  "same-day-repeats": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 3,
      "state": "learning",
      "step": 1,
      "stability": 3.173,
      "difficulty": 5.282434422319005,
      "due": "2026-01-01T09:10:00Z"
    },
    {
      "at": "2026-01-01T09:05:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 4.466858064362218,
      "difficulty": 5.272967931287446,
      "due": "2026-01-05T09:05:00Z"
    },
    {
      "at": "2026-01-01T09:25:00Z",
      "rating": 2,
      "state": "review",
      "step": 0,
      "stability": 3.751452215938514,
      "difficulty": 6.0270563403407795,
      "due": "2026-01-05T09:25:00Z"
    },
    {
      "at": "2026-01-01T09:55:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 5.2811864430616025,
      "difficulty": 6.01416458848632,
      "due": "2026-01-06T09:55:00Z"
    },
    {
      "at": "2026-01-01T10:55:00Z",
      "rating": 4,
      "state": "review",
      "step": 0,
      "stability": 12.462305553031479,
      "difficulty": 5.357539046422203,
      "due": "2026-01-13T10:55:00Z"
    },
    {
      "at": "2026-01-13T10:55:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 37.78982927847902,
      "difficulty": 5.347727074119769,
      "due": "2026-02-20T10:55:00Z"
    },
    {
      "at": "2026-02-20T10:55:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 107.87927811310061,
      "difficulty": 5.337960236889926,
      "due": "2026-06-08T10:55:00Z"
    }
  ],
  "easy-first": [
    {
      "at": "2026-01-01T09:00:00Z",
      "rating": 4,
      "state": "review",
      "step": 0,
      "stability": 15.69105,
      "difficulty": 3.2245015893713678,
      "due": "2026-01-17T09:00:00Z"
    },
    {
      "at": "2026-01-17T09:00:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 60.708278951323,
      "difficulty": 3.2245015893713673,
      "due": "2026-03-19T09:00:00Z"
    },
    {
      "at": "2026-03-19T09:00:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 206.99233149775765,
      "difficulty": 3.224501589371367,
      "due": "2026-10-12T09:00:00Z"
    },
    {
      "at": "2026-10-12T09:00:00Z",
      "rating": 3,
      "state": "review",
      "step": 0,
      "stability": 636.081287530905,
      "difficulty": 3.2245015893713664,
      "due": "2028-07-09T09:00:00Z"
    }
  ]
}
