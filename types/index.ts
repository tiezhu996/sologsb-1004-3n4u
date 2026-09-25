export type ScriptStatus = 'draft' | 'review' | 'returned' | 'approved'
export type DeviceKind = 'desktop' | 'tablet' | 'mobile' | 'kiosk'
export type SegmentSyncState = 'verified' | 'unverified' | 'pending' | 'source-missing' | 'unlinked'
export type PublishBlockReason = Exclude<SegmentSyncState, 'verified'> | 'missing-translation'

export interface Hall {
  id: string
  name: string
  description: string
}

/** 译文段落所依据的中文原文版本 */
export interface SourceLink {
  sourceSegmentId: string
  sourceRevision: number
  verified: boolean
  verifiedAt: string
}

export interface Segment {
  id: string
  label: string
  content: string
  locked: boolean
  /** 仅中文原文段落：版本号，改动或解锁时递增 */
  revision?: number
  /** 仅译文段落：与中文原文段落的对应关系 */
  source?: SourceLink
}

export interface PublishBlocker {
  exhibitId: string
  exhibitCode: string
  exhibitTitle: string
  languageId: string
  segmentId: string
  segmentLabel: string
  reason: PublishBlockReason
}

export interface LanguageDraft {
  id: string
  languageId: string
  title: string
  narration: string
  accessibility: string
  durationMinutes: number
  sources: string
  status: ScriptStatus
  segments: Segment[]
  updatedAt: string
}

export interface Exhibit {
  id: string
  hallId: string
  code: string
  title: string
  order: number
  drafts: LanguageDraft[]
}

export interface Language {
  id: string
  code: string
  label: string
  shortLabel: string
}

export interface VersionSnapshot {
  id: string
  exhibitId: string
  languageId: string
  name: string
  createdAt: string
  draft: LanguageDraft
}

export interface PersistedState {
  halls: Hall[]
  exhibits: Exhibit[]
  versions: VersionSnapshot[]
  selectedHallId: string
  selectedExhibitId: string
  selectedLanguageId: string
  lastSavedAt: string
  lastPublishedAt: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}
