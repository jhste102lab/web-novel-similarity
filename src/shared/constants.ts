// Every tunable number of the engine. Tier thresholds change only together
// with an updated benchmark report (docs/benchmark.md). See docs/ssot/architecture.md.

/** Sentences shorter than this (after normalisation) are not indexed. */
export const MIN_SENTENCE_CHARS = 8

/** Character n-gram length for fingerprints, on normalised text. */
export const NGRAM = 5
/** Winnowing window: one fingerprint is kept per window of this many hashes. */
export const WINDOW = 4
/** A sentence pair becomes a candidate when it shares at least this many fingerprints. */
export const MIN_SHARED_FINGERPRINTS = 1
/** Fingerprints occurring in more sentences than this are too common to be discriminative. */
export const MAX_POSTINGS = 400
/** Candidates kept per query sentence, best fingerprint overlap first. */
export const MAX_CANDIDATES_PER_SENTENCE = 16

/** Similarity thresholds, inclusive lower bounds. Below TIER_EDITED nothing is reported:
 * on unrelated manuscripts every hit in the old 0.45–0.62 band was a false positive. */
export const TIER_NEAR = 0.9
export const TIER_EDITED = 0.62

/** 흔한 표현: short sentence recurring across many chapters. */
export const COMMON_MAX_CHARS = 14
export const COMMON_MIN_CHAPTERS = 4

/** 내부 반복: repeats closer than this many sentences are one occurrence, not a repeat. */
export const REPEAT_MIN_GAP = 3

/** Progress is reported after this many query sentences. */
export const PROGRESS_EVERY = 500

/** Findings stream to the UI at most this often; below ~250ms the regrouping cost shows up. */
export const PARTIAL_EVERY_MS = 400

/** A report is reviewed by a human; beyond this the strongest findings are kept and the rest
 * are only counted. Uncapped results reached ~600k passages (multi-GB DOM) on 2M-char pairs. */
export const MAX_RESULTS = 3000
/** Passages kept per chapter pair, strongest first. */
export const MAX_PASSAGES_PER_MATCH = 20
