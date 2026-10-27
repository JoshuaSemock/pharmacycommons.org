/**
 * Learn — shared types (docs/learn.md §6). Field names mirror the database so rows map 1:1.
 *
 * Destination: src/learn/types.ts
 */

export type Rating = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

/** How an answer is graded and weighted by the scheduler. */
export type StudyMode = 'flashcard' | 'mcq'

/** The values the database accepts in learn_review_events.study_mode. */
export type EventMode = 'due_queue' | 'flashcard' | 'mcq_practice' | 'mcq_test'

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

/** Per-learner scheduling state of one item (learn_user_item_state, plus `step`). */
export type SchedState = {
  state: CardState
  /** Index into the learning / relearning steps while state is learning or relearning. */
  step: number
  stability: number
  difficulty: number
  reps: number
  lapses: number
  last_rating: Rating | null
  last_reviewed_at: string | null
  due_at: string
}

export type McqOption = { id: string; text: string; is_correct: boolean; rationale?: string | null }

export type LearnItem = {
  id: string
  item_type: 'flashcard' | 'mcq'
  template_key: string | null
  subject_area: string
  topic: string
  subtopic: string | null
  tags: string[]
  primary_pcid: number | null
  prompt: string
  concise_answer: string
  clinical_rationale: string | null
  clinical_caveats: string | null
  mcq_options: McqOption[] | null
  source_agency: string | null
  source_citation: string
  source_url: string | null
  license: string
  third_party_sources: string[]
  content_version: number
}

export type LearnCollection = {
  id: string
  slug: string | null
  title: string
  description: string | null
  subject_area: string
  item_count: number
}

/** One review as logged on the device (guest mode) or sent to the server. */
export type ReviewEvent = {
  client_event_id: string
  item_id: string
  collection_id: string | null
  mode: EventMode
  rating: Rating
  is_correct: boolean | null
  selected_option_id: string | null
  was_unsure: boolean
  duration_ms: number | null
  reviewed_at: string
  scheduler_version: string
  state_before: SchedState
  state_after: SchedState
}
