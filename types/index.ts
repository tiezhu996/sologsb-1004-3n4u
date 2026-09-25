export type ScriptStatus = 'draft' | 'review' | 'returned' | 'approved'
export type DeviceKind = 'desktop' | 'tablet' | 'mobile' | 'kiosk'
/** 译文段落与中文原文的同步关系 */
export type SegmentSyncState = 'synced' | 'stale' | 'unverified' | 'orphan'
/** 整组发布前的问题类型 */
export type PublishBlockerKind = 'stale' | 'orphan' | 'unverified' | 'missing-translation'

export interface Hall {
  id: string
  name: string
  description: string
}

export interface Segment {
  id: string
  label: string
  content: string
  locked: boolean
  /** 仅中文原文段落：当前版本令牌，改动/解锁/恢复后会更换 */
  sourceVersion?: string
  sourceVersionAt?: string
  /** 仅译文段落：对应的中文段落 id */
  sourceSegmentId?: string
  /** 译者核对时所依据的中文版本令牌 */
  basedOnVersion?: string
  basedOnVersionAt?: string
  /** 译者最近一次核对时间 */
  checkedAt?: string
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
  groupPublishedAt?: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}

/** 某个译文文稿内阻塞发布的段落明细 */
export interface DraftBlockers {
  /** 该语言文稿尚未创建 */
  missingDraft: boolean
  stale: Segment[]
  orphan: Segment[]
  unverified: Segment[]
  /** 中文有、但该语言缺少对应译文的段落 */
  missingTranslation: Segment[]
  total: number
}

/** 整组发布校验结果条目 */
export interface PublishBlocker {
  kind: PublishBlockerKind
  exhibitId: string
  exhibitCode: string
  exhibitTitle: string
  hallId: string
  hallName: string
  languageId: string
  languageLabel: string
  segmentId?: string
  segmentLabel?: string
  detail: string
}
