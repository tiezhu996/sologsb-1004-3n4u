import { defineStore } from 'pinia'
import type {
  DraftBlockers, Exhibit, Hall, Language, LanguageDraft, PersistedState,
  PublishBlocker, ScriptStatus, Segment, SegmentSyncState, VersionSnapshot
} from '~/types'

export const LANGUAGES: Language[] = [
  { id: 'zh', code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { id: 'en', code: 'en-US', label: 'English', shortLabel: 'EN' },
  { id: 'ja', code: 'ja-JP', label: '日本語', shortLabel: '日' }
]

export const SOURCE_LANGUAGE_ID = 'zh'
const TRANSLATION_LANGUAGES = LANGUAGES.filter(item => item.id !== SOURCE_LANGUAGE_ID)

const STORAGE_KEY = 'museum-script-studio-v1'

function newSourceVersion(seed?: string): string {
  if (seed) return `v-${seed}-${Math.random().toString(36).slice(2, 8)}`
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 中文原文段落 */
function zhSegment(id: string, label: string, content: string, locked = false, seed = '1'): Segment {
  return { id, label, content, locked, sourceVersion: newSourceVersion(seed), sourceVersionAt: '2026-09-19T02:00:00.000Z' }
}

/** 译文段落；sourceSegmentId 为空表示尚未建立对应关系 */
function trSegment(
  id: string,
  label: string,
  content: string,
  sourceSegmentId: string | null,
  basedOnVersion?: string
): Segment {
  const segment: Segment = { id, label, content, locked: false }
  if (sourceSegmentId) segment.sourceSegmentId = sourceSegmentId
  if (basedOnVersion) {
    segment.basedOnVersion = basedOnVersion
    segment.basedOnVersionAt = '2026-09-20T04:00:00.000Z'
    segment.checkedAt = '2026-09-20T04:00:00.000Z'
  }
  return segment
}

/** 译文段落相对中文原文的同步状态 */
export function syncStateOf(segment: Segment, sourceById: Map<string, Segment>): SegmentSyncState | null {
  if (segment.sourceVersion) return null
  if (!segment.sourceSegmentId) return 'orphan'
  const source = sourceById.get(segment.sourceSegmentId)
  if (!source) return 'orphan'
  if (!segment.basedOnVersion) return 'unverified'
  return segment.basedOnVersion === source.sourceVersion ? 'synced' : 'stale'
}

export const SYNC_META: Record<SegmentSyncState, { label: string; color: string; icon: string }> = {
  synced: { label: '已同步', color: 'success', icon: 'mdi-check-circle-outline' },
  stale: { label: '待同步', color: 'error', icon: 'mdi-sync-alert' },
  unverified: { label: '未核对', color: 'warning', icon: 'mdi-clock-check-outline' },
  orphan: { label: '缺少对应关系', color: 'grey-darken-1', icon: 'mdi-link-variant-off' }
}

/** 单个译文文稿的发布阻塞明细 */
export function computeDraftBlockers(
  exhibit: Exhibit,
  languageId: string,
  sourceById: Map<string, Segment>
): DraftBlockers {
  const empty: DraftBlockers = { missingDraft: false, stale: [], orphan: [], unverified: [], missingTranslation: [], total: 0 }
  const zhDraft = exhibit.drafts.find(item => item.languageId === SOURCE_LANGUAGE_ID)
  const draft = exhibit.drafts.find(item => item.languageId === languageId)
  if (!draft) {
    return { ...empty, missingDraft: true, missingTranslation: zhDraft ? [...zhDraft.segments] : [], total: zhDraft?.segments.length || 0 }
  }
  for (const segment of draft.segments) {
    const state = syncStateOf(segment, sourceById)
    if (state === 'stale') empty.stale.push(segment)
    else if (state === 'orphan') empty.orphan.push(segment)
    else if (state === 'unverified') empty.unverified.push(segment)
  }
  if (zhDraft) {
    const linkedIds = new Set(draft.segments.map(segment => segment.sourceSegmentId).filter(Boolean) as string[])
    empty.missingTranslation = zhDraft.segments.filter(segment => !linkedIds.has(segment.id))
  }
  empty.total = empty.stale.length + empty.orphan.length + empty.unverified.length + empty.missingTranslation.length
  return empty
}

/** 跨全部展项、语言聚合发布阻塞项 */
export function computePublishBlockers(
  exhibits: Exhibit[],
  halls: Hall[],
  languages: Language[]
): PublishBlocker[] {
  const hallName = (id: string) => halls.find(hall => hall.id === id)?.name || ''
  const languageLabel = (id: string) => languages.find(language => language.id === id)?.label || id
  const blockers: PublishBlocker[] = []
  for (const exhibit of exhibits) {
    const zhDraft = exhibit.drafts.find(item => item.languageId === SOURCE_LANGUAGE_ID)
    const sourceById = new Map((zhDraft?.segments || []).map(segment => [segment.id, segment]))
    for (const language of languages.filter(item => item.id !== SOURCE_LANGUAGE_ID)) {
      const info = computeDraftBlockers(exhibit, language.id, sourceById)
      const push = (kind: PublishBlocker['kind'], segment: Segment | undefined, detail: string) => blockers.push({
        kind, exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
        hallId: exhibit.hallId, hallName: hallName(exhibit.hallId),
        languageId: language.id, languageLabel: languageLabel(language.id),
        segmentId: segment?.id, segmentLabel: segment?.label, detail
      })
      if (info.missingDraft) push('missing-translation', undefined, `${language.label}文稿尚未创建，全部 ${info.missingTranslation.length} 个中文段落无对应译文`)
      else info.missingTranslation.forEach(segment => push('missing-translation', segment, '中文段落缺少对应译文'))
      info.stale.forEach(segment => {
        const source = sourceById.get(segment.sourceSegmentId || '')
        push('stale', segment, source ? `中文原文已更新到 ${shortVersion(source.sourceVersion)}，译文仍依据 ${shortVersion(segment.basedOnVersion)}` : '引用的中文原文已变更')
      })
      info.orphan.forEach(segment => push('orphan', segment, segment.sourceSegmentId ? '所对应的中文段落已移除或在恢复后不存在，请重新关联' : '尚未关联对应中文段落'))
      info.unverified.forEach(segment => push('unverified', segment, '译者尚未核对并记录所依据的中文版本'))
    }
  }
  const rank: Record<PublishBlocker['kind'], number> = { stale: 0, orphan: 1, unverified: 2, 'missing-translation': 3 }
  return blockers.sort((a, b) => a.exhibitCode.localeCompare(b.exhibitCode, 'zh-CN') || rank[a.kind] - rank[b.kind] || a.languageId.localeCompare(b.languageId))
}

export function shortVersion(version?: string): string {
  if (!version) return '—'
  const parts = version.split('-')
  return parts.length >= 3 ? `${parts[1]}-${parts[2].slice(0, 4)}` : version
}

function demoState(): PersistedState {
  const halls: Hall[] = [
    { id: 'hall-ancient', name: '文明肇始厅', description: '史前至先秦文明，共 18 个展项' },
    { id: 'hall-silk', name: '丝路交融厅', description: '丝绸之路上的器物、信仰与生活' },
    { id: 'hall-city', name: '城市记忆厅', description: '近现代城市空间与市民生活' }
  ]

  // ---- 展项一：玉琮。中文 4 段，英文 3 段且第 2 段引用旧版（待同步，已定稿将被退回）；日文 3 段含未核对 ----
  const jadeZh: Segment[] = [
    zhSegment('jade-zh-1', '开场定位', '这件玉琮来自距今约五千年的良渚文化。', true, 'a1'),
    zhSegment('jade-zh-2', '器物观察', '它外方内圆，四角雕刻神人兽面纹。', true, 'a2'),
    zhSegment('jade-zh-3', '文化含义', '玉琮常被看作沟通天地的礼器，也象征权力与身份。', false, 'a3'),
    zhSegment('jade-zh-4', '参观提示', '请沿展柜顺时针观察，触摸复制品前先使用免洗消毒液。', false, 'a4')
  ]
  const jadeEn: Segment[] = [
    trSegment('jade-en-1', 'Introduction', 'This jade cong is about five thousand years old.', 'jade-zh-1', jadeZh[0].sourceVersion),
    // 引用旧版：中文第 2 段当前是 a2-xxxx，英文依据 a2-old → 加载后自动待同步
    trSegment('jade-en-2', 'Visual description', 'Its square body encloses a circular opening, while spirit-and-animal motifs cover the corners.', 'jade-zh-2', 'v-a2-old00'),
    trSegment('jade-en-3', 'Meaning', 'Jade cong is understood as a ritual link between heaven and earth.', 'jade-zh-3', jadeZh[2].sourceVersion)
  ]
  const jadeJa: Segment[] = [
    trSegment('jade-ja-1', '導入', '約五千年前の良渚文化を代表する玉琮です。', 'jade-zh-1', jadeZh[0].sourceVersion),
    trSegment('jade-ja-2', '観察', '外側は方形、中央は円形で、四隅に精緻な文様があります。', null),
    trSegment('jade-ja-3', '意味', '天地を結ぶ礼器として、力と身分を象徴しました。', 'jade-zh-3')
  ]

  // ---- 展项二：青铜爵。英文 2 段，其中 1 段未关联中文 ----
  const bronzeZh: Segment[] = [
    zhSegment('bronze-zh-1', '器物介绍', '这是一件商代青铜爵，用于温酒和饮酒。', false, 'b1'),
    zhSegment('bronze-zh-2', '结构说明', '三足使器身稳定，前端的流便于倾倒。', false, 'b2'),
    zhSegment('bronze-zh-3', '礼制背景', '青铜器数量与形制反映了使用者的身份。', false, 'b3'),
    zhSegment('bronze-zh-4', '修改说明', '审校意见：补充“柱饰”的用途，并核对年代。', false, 'b4')
  ]
  const bronzeEn: Segment[] = [
    trSegment('bronze-en-1', 'Object', 'This bronze jue dates to the Shang dynasty.', 'bronze-zh-1', bronzeZh[0].sourceVersion),
    trSegment('bronze-en-2', 'Structure', 'Three legs support the body; the long spout guides the pour.', null)
  ]

  // ---- 展项三：织机。仅有中文，英文/日文整稿缺失 ----
  const silkZh: Segment[] = [
    zhSegment('silk-zh-1', '序言', '丝绸不只是一种材料，也是交流的媒介。', false, 'c1'),
    zhSegment('silk-zh-2', '互动', '请试着推动梭子，观察经纬线如何交会。', false, 'c2')
  ]

  const exhibits: Exhibit[] = [
    {
      id: 'exhibit-jade', hallId: 'hall-ancient', code: 'A-03', title: '玉琮：沟通天地的礼器', order: 3,
      drafts: [
        {
          id: 'draft-jade-zh', languageId: 'zh', title: '玉琮：沟通天地的礼器',
          narration: '这件玉琮出土于长江下游的良渚遗址。它外方内圆，四角雕刻神人兽面纹，体现了新石器时代晚期精湛的玉器工艺。',
          accessibility: '玉琮为深青色，高约二十厘米。触摸模型可感受方形四角与中央圆孔；圆孔贯穿器身。',
          durationMinutes: 2.5, sources: '《中国玉器全集》第一卷；本馆藏品档案 1987-J-042',
          status: 'approved', updatedAt: '2026-09-23T08:35:00.000Z', segments: jadeZh
        },
        {
          id: 'draft-jade-en', languageId: 'en', title: 'Jade Cong: A Ritual Object Between Heaven and Earth',
          narration: 'This jade cong was made by the Liangzhu culture. Its square exterior and circular bore embody an early Chinese vision of the cosmos.',
          accessibility: 'The object is dark green. A tactile model shows four corners, carved faces, and a central circular opening.',
          durationMinutes: 2.3, sources: 'Complete Collection of Chinese Jades, Vol. 1; Museum accession 1987-J-042',
          status: 'approved', updatedAt: '2026-09-24T02:15:00.000Z', segments: jadeEn
        },
        {
          id: 'draft-jade-ja', languageId: 'ja', title: '玉琮：天と地を結ぶ礼器',
          narration: 'こちらは良渚文化の玉琮です。外側は方形、中央は円形で、四隅には神人獣面文が刻まれています。',
          accessibility: '暗い青緑色の玉製です。複製模型では四つの角と中央の円孔を触って確認できます。',
          durationMinutes: 2.6, sources: '『中国玉器全集』第一巻；収蔵資料 1987-J-042',
          status: 'review', updatedAt: '2026-09-21T06:10:00.000Z', segments: jadeJa
        }
      ]
    },
    {
      id: 'exhibit-bronze', hallId: 'hall-ancient', code: 'A-08', title: '青铜爵与礼制', order: 8,
      drafts: [
        {
          id: 'draft-bronze-zh', languageId: 'zh', title: '青铜爵与礼制',
          narration: '爵是最早的青铜酒器之一。三足稳定器身，长流便于倾倒，柱饰则与商周礼仪密切相关。',
          accessibility: '器物为青铜色，器口一侧有长流，底部三足支撑。复制件配有可触摸的局部纹样。',
          durationMinutes: 3, sources: '《殷周青铜器通论》；展品说明卡 A-08',
          status: 'returned', updatedAt: '2026-09-23T11:20:00.000Z', segments: bronzeZh
        },
        {
          id: 'draft-bronze-en', languageId: 'en', title: 'Bronze Jue and Ritual Order',
          narration: 'The jue was among the earliest bronze drinking vessels. Its tripod base, pouring spout, and posts were closely tied to Shang and Zhou ritual.',
          accessibility: 'The tactile replica includes the long spout, tripod feet, and raised posts.',
          durationMinutes: 2.8, sources: 'A General Survey of Yin-Zhou Bronzes; Gallery label A-08',
          status: 'review', updatedAt: '2026-09-22T09:00:00.000Z', segments: bronzeEn
        }
      ]
    },
    {
      id: 'exhibit-silk', hallId: 'hall-silk', code: 'B-02', title: '织机与丝路纹样', order: 2,
      drafts: [{
        id: 'draft-silk-zh', languageId: 'zh', title: '织机与丝路纹样',
        narration: '织机把一根根丝线组织成布匹，也把不同地区的图案与故事连接在一起。',
        accessibility: '体验区提供放大纹样、凸点经纬结构以及可操作的小型织机模型。',
        durationMinutes: 4, sources: '馆内教育活动资料；丝绸之路纺织史专题',
        status: 'draft', updatedAt: '2026-09-20T03:00:00.000Z', segments: silkZh
      }]
    }
  ]
  return {
    halls,
    exhibits,
    versions: [],
    selectedHallId: halls[0].id,
    selectedExhibitId: exhibits[0].id,
    selectedLanguageId: 'zh',
    lastSavedAt: new Date().toISOString()
  }
}

export const useScriptStore = defineStore('museum-script', {
  state: () => ({
    halls: [] as Hall[],
    exhibits: [] as Exhibit[],
    versions: [] as VersionSnapshot[],
    selectedHallId: '',
    selectedExhibitId: '',
    selectedLanguageId: 'zh',
    lastSavedAt: '',
    groupPublishedAt: '',
    hydrated: false,
    past: [] as string[],
    future: [] as string[],
    notice: ''
  }),
  getters: {
    selectedHall(state): Hall | undefined {
      return state.halls.find(hall => hall.id === state.selectedHallId)
    },
    hallExhibits(state): Exhibit[] {
      return state.exhibits.filter(exhibit => exhibit.hallId === state.selectedHallId).sort((a, b) => a.order - b.order)
    },
    selectedExhibit(state): Exhibit | undefined {
      return state.exhibits.find(exhibit => exhibit.id === state.selectedExhibitId)
    },
    selectedDraft(): LanguageDraft | undefined {
      return this.selectedExhibit?.drafts.find(draft => draft.languageId === this.selectedLanguageId)
    },
    /** 当前展项中文段落索引 */
    sourceSegments(): Segment[] {
      return this.selectedExhibit?.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)?.segments || []
    },
    wordCount(): number {
      return (this.selectedDraft?.narration || '').replace(/\s/g, '').length
    },
    canUndo(state): boolean { return state.past.length > 0 },
    canRedo(state): boolean { return state.future.length > 0 },
    /** 当前译文文稿各段落的同步状态 */
    draftSyncStates(): Record<string, SegmentSyncState | null> {
      const sourceById = new Map(this.sourceSegments.map(segment => [segment.id, segment]))
      const result: Record<string, SegmentSyncState | null> = {}
      for (const segment of this.selectedDraft?.segments || []) {
        result[segment.id] = syncStateOf(segment, sourceById)
      }
      return result
    },
    /** 当前译文文稿的阻塞明细 */
    currentDraftBlockers(): DraftBlockers | null {
      const exhibit = this.selectedExhibit
      if (!exhibit || this.selectedLanguageId === SOURCE_LANGUAGE_ID) return null
      const sourceById = new Map(this.sourceSegments.map(segment => [segment.id, segment]))
      return computeDraftBlockers(exhibit, this.selectedLanguageId, sourceById)
    },
    /** 整组发布阻塞项（跨全部展项和语言） */
    publishBlockers(state): PublishBlocker[] {
      return computePublishBlockers(state.exhibits, state.halls, LANGUAGES)
    }
  },
  actions: {
    hydrate() {
      if (this.hydrated || typeof localStorage === 'undefined') return
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const data = JSON.parse(saved) as PersistedState
          this.$patch({ ...data, hydrated: true })
          if (!this.halls.length || !this.exhibits.length) {
            this.resetDemo()
            return
          }
        } catch {
          this.resetDemo()
          return
        }
      } else {
        this.resetDemo()
        return
      }
      this.ensureSelection()
      this.normalizeLegacyData()
      // 旧数据加载后统一重算：引用旧原文的已定稿译文在此退回
      const returned = this.reconcileSync()
      if (returned > 0) this.persist()
      this.notice = returned
        ? `检测到 ${returned} 份引用旧版中文原文的已定稿译文，已自动标记待同步并退回。`
        : '本地稿件已恢复。'
      this.hydrated = true
    },
    resetDemo() {
      this.$patch({ ...demoState(), hydrated: true, past: [], future: [] })
      const returned = this.reconcileSync()
      this.persist()
      this.notice = returned
        ? `示例数据中 ${returned} 份旧版译文已自动退回，请处理“待同步”段落。`
        : '示例数据已就绪，可直接开始编辑。'
    },
    /** 给旧版本数据（无版本关系字段）补齐结构，缺字段一律视为待核对/缺对应 */
    normalizeLegacyData() {
      let changed = false
      for (const exhibit of this.exhibits) {
        const zhDraft = exhibit.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)
        for (const draft of exhibit.drafts) {
          for (const segment of draft.segments) {
            if (draft.languageId === SOURCE_LANGUAGE_ID) {
              if (!segment.sourceVersion) {
                segment.sourceVersion = newSourceVersion('legacy')
                segment.sourceVersionAt = new Date().toISOString()
                changed = true
              }
            } else if (segment.sourceSegmentId && !zhDraft?.segments.some(item => item.id === segment.sourceSegmentId)) {
              // 对应中文段落已不存在：保留引用用于提示，状态按孤儿处理
            }
          }
        }
      }
      if (changed) this.persist()
    },
    snapshot(): string {
      return JSON.stringify({
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        groupPublishedAt: this.groupPublishedAt
      })
    },
    commit(mutator: () => void) {
      this.past.push(this.snapshot())
      if (this.past.length > 50) this.past.shift()
      this.future = []
      mutator()
      this.reconcileSync()
      this.lastSavedAt = new Date().toISOString()
      this.persist()
    },
    persist() {
      if (typeof localStorage === 'undefined') return
      const data: PersistedState = {
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        selectedHallId: this.selectedHallId, selectedExhibitId: this.selectedExhibitId,
        selectedLanguageId: this.selectedLanguageId, lastSavedAt: this.lastSavedAt,
        groupPublishedAt: this.groupPublishedAt
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    /**
     * 统一重算版本关系：
     * 引用旧版中文原文（待同步）或缺少对应关系的已定稿译文一律退回为“退回”态。
     * 返回被退回的文稿数量。
     */
    reconcileSync(): number {
      let returned = 0
      for (const exhibit of this.exhibits) {
        const zhDraft = exhibit.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)
        const sourceById = new Map((zhDraft?.segments || []).map(segment => [segment.id, segment]))
        for (const draft of exhibit.drafts) {
          if (draft.languageId === SOURCE_LANGUAGE_ID) continue
          const blockers = computeDraftBlockers(exhibit, draft.languageId, sourceById)
          if (draft.status === 'approved' && (blockers.stale.length > 0 || blockers.orphan.length > 0)) {
            draft.status = 'returned'
            returned += 1
          }
        }
      }
      return returned
    },
    ensureSelection() {
      if (!this.halls.some(hall => hall.id === this.selectedHallId)) this.selectedHallId = this.halls[0]?.id || ''
      const inHall = this.exhibits.filter(exhibit => exhibit.hallId === this.selectedHallId)
      if (!inHall.some(exhibit => exhibit.id === this.selectedExhibitId)) this.selectedExhibitId = inHall[0]?.id || ''
      const exhibit = this.selectedExhibit
      if (!exhibit?.drafts.some(draft => draft.languageId === this.selectedLanguageId)) this.selectedLanguageId = exhibit?.drafts[0]?.languageId || 'zh'
    },
    selectHall(id: string) {
      this.selectedHallId = id
      const exhibit = this.exhibits.find(item => item.hallId === id)
      this.selectedExhibitId = exhibit?.id || ''
      this.ensureSelection()
      this.persist()
    },
    selectExhibit(id: string) {
      this.selectedExhibitId = id
      this.ensureSelection()
      this.persist()
    },
    selectLanguage(id: string) {
      this.selectedLanguageId = id
      this.persist()
    },
    updateDraft(patch: Partial<Pick<LanguageDraft, 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources'>>) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => Object.assign(draft, patch, { updatedAt: new Date().toISOString() }))
      this.notice = '改动已自动保存到浏览器。'
    },
    updateSegment(id: string, patch: Partial<Pick<Segment, 'label' | 'content'>>) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || segment.locked) return
      if (draft.languageId === SOURCE_LANGUAGE_ID) {
        // 中文原文内容改动 → 产生新版本，引用旧版的译文在 reconcileSync 中退回
        if (typeof patch.content === 'string' && patch.content !== segment.content) {
          this.commit(() => {
            Object.assign(segment, patch)
            segment.sourceVersion = newSourceVersion()
            segment.sourceVersionAt = new Date().toISOString()
          })
          this.notice = '中文原文已更新为新版本，引用旧版的译文已标记待同步。'
          return
        }
      }
      this.commit(() => Object.assign(segment, patch))
    },
    toggleLock(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment) return
      if (draft.languageId === SOURCE_LANGUAGE_ID) {
        if (segment.locked) {
          // 中文段落解锁：原文可再改，同样换版并使旧译文失效
          this.commit(() => {
            segment.locked = false
            segment.sourceVersion = newSourceVersion()
            segment.sourceVersionAt = new Date().toISOString()
          })
          this.notice = '中文段落已解锁并生成新版本，引用旧版的译文已标记待同步。'
          return
        }
        this.commit(() => { segment.locked = true })
        this.notice = '中文段落已锁定。'
        return
      }
      this.commit(() => { segment.locked = !segment.locked })
      this.notice = segment.locked ? '译文段落已锁定，避免误改。' : '译文段落已解锁。'
    },
    addSegment() {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => {
        const id = `segment-${Date.now()}`
        const base: Segment = { id, label: `新段落 ${draft.segments.length + 1}`, content: '', locked: false }
        if (draft.languageId === SOURCE_LANGUAGE_ID) {
          base.sourceVersion = newSourceVersion()
          base.sourceVersionAt = new Date().toISOString()
        }
        draft.segments.push(base)
      })
    },
    removeSegment(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || segment.locked) return
      if (draft.languageId === SOURCE_LANGUAGE_ID) {
        // 移除中文段落：对应译文变成“缺少对应关系”，已定稿的在重算中退回
        this.commit(() => { draft.segments = draft.segments.filter(item => item.id !== id) })
        this.notice = '中文段落已移除，引用它的译文已标记为缺少对应关系。'
        return
      }
      this.commit(() => { draft.segments = draft.segments.filter(item => item.id !== id) })
    },
    /** 译者把译文段落关联到对应中文段落；关联后仍需核对才能记下原文版本 */
    linkSegmentSource(id: string, sourceSegmentId: string | null) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || draft.languageId === SOURCE_LANGUAGE_ID) return
      this.commit(() => {
        if (sourceSegmentId) {
          segment.sourceSegmentId = sourceSegmentId
          // 重新关联后必须重新核对，清除旧的依据记录
          delete segment.basedOnVersion
          delete segment.basedOnVersionAt
          delete segment.checkedAt
        } else {
          delete segment.sourceSegmentId
          delete segment.basedOnVersion
          delete segment.basedOnVersionAt
          delete segment.checkedAt
        }
      })
      this.notice = sourceSegmentId ? '已建立段落对应关系，请核对后确认所依据的中文版本。' : '已取消段落对应关系。'
    },
    /** 译者核对：确认译文依据当前中文版本 */
    confirmSegmentSynced(id: string) {
      const exhibit = this.selectedExhibit
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      const source = exhibit?.drafts.find(item => item.languageId === SOURCE_LANGUAGE_ID)?.segments.find(item => item.id === segment?.sourceSegmentId)
      if (!draft || !segment || !source || draft.languageId === SOURCE_LANGUAGE_ID) return
      const now = new Date().toISOString()
      this.commit(() => {
        segment.basedOnVersion = source.sourceVersion
        segment.basedOnVersionAt = source.sourceVersionAt
        segment.checkedAt = now
      })
      this.notice = `已核对并记录中文版本 ${shortVersion(source.sourceVersion)}。`
    },
    /** 批量核对：把文稿内已关联、且依据版本仍匹配/译者已逐段确认的段落记为已同步 */
    confirmAllSynced() {
      const exhibit = this.selectedExhibit
      const draft = this.selectedDraft
      if (!exhibit || !draft || draft.languageId === SOURCE_LANGUAGE_ID) return
      const sourceById = new Map(this.sourceSegments.map(segment => [segment.id, segment]))
      const targets = draft.segments.filter(segment => {
        const state = syncStateOf(segment, sourceById)
        return state === 'stale' || state === 'unverified'
      })
      if (!targets.length) {
        this.notice = '没有需要核对的段落。'
        return
      }
      this.commit(() => {
        const now = new Date().toISOString()
        for (const segment of targets) {
          const source = sourceById.get(segment.sourceSegmentId || '')
          if (!source) continue
          segment.basedOnVersion = source.sourceVersion
          segment.basedOnVersionAt = source.sourceVersionAt
          segment.checkedAt = now
        }
      })
      this.notice = `已核对 ${targets.length} 个段落并记录当前中文版本。`
    },
    setStatus(status: ScriptStatus) {
      const draft = this.selectedDraft
      if (!draft) return
      if (status === 'approved' && draft.languageId !== SOURCE_LANGUAGE_ID && this.currentDraftBlockers && this.currentDraftBlockers.total > 0) {
        this.notice = '仍有段落待同步、缺少对应关系或尚未核对，不能标记为已定稿。'
        return
      }
      this.commit(() => { draft.status = status; draft.updatedAt = new Date().toISOString() })
      this.notice = `状态已更新为“${this.statusLabel(status)}”。`
    },
    statusLabel(status: ScriptStatus) {
      return ({ draft: '草稿', review: '待审', returned: '退回', approved: '已定稿' })[status]
    },
    createVersion(name?: string) {
      const draft = this.selectedDraft
      if (!draft) return
      const version: VersionSnapshot = {
        id: `version-${Date.now()}`,
        exhibitId: this.selectedExhibitId,
        languageId: this.selectedLanguageId,
        name: name || `${new Date().toLocaleString('zh-CN', { hour12: false })} 快照`,
        createdAt: new Date().toISOString(),
        draft: JSON.parse(JSON.stringify(draft))
      }
      this.commit(() => this.versions.unshift(version))
      this.notice = '已保存当前版本，可在版本页比较或恢复。'
    },
    restoreVersion(id: string) {
      const version = this.versions.find(item => item.id === id)
      if (!version) return
      // commit 内统一重算：恢复中文旧快照后，依据其他版本的译文会重新变待同步并退回
      this.commit(() => {
        const exhibit = this.exhibits.find(item => item.id === version.exhibitId)
        if (!exhibit) return
        const index = exhibit.drafts.findIndex(item => item.languageId === version.languageId)
        const restored = JSON.parse(JSON.stringify(version.draft)) as LanguageDraft
        if (index >= 0) exhibit.drafts[index] = restored
        else exhibit.drafts.push(restored)
      })
      this.selectedExhibitId = version.exhibitId
      this.selectedLanguageId = version.languageId
      this.notice = version.languageId === SOURCE_LANGUAGE_ID
        ? '中文旧快照已恢复，引用其他版本的译文已重新标记待同步并退回。'
        : '版本已恢复，同步关系已重新计算。'
    },
    undo() {
      const state = this.past.pop()
      if (!state) return
      this.future.push(this.snapshot())
      this.$patch(JSON.parse(state))
      // 撤销同样要重新计算版本关系与退回状态
      this.reconcileSync()
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已撤销上一步，译文同步关系已重新计算。'
    },
    redo() {
      const state = this.future.pop()
      if (!state) return
      this.past.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.reconcileSync()
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已重做，译文同步关系已重新计算。'
    },
    publishGroup() {
      if (this.publishBlockers.length) {
        this.notice = '仍存在待同步、缺少对应关系或尚未核对的译文，整组发布不能继续。'
        return
      }
      this.commit(() => { this.groupPublishedAt = new Date().toISOString() })
      this.notice = '整组多语言稿件已发布。'
    },
    completionFor(exhibit: Exhibit, languageId: string): number {
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!draft) return 0
      const checks = [draft.title, draft.narration, draft.accessibility, draft.sources, draft.segments.length > 0 ? 'segments' : '']
      return Math.round(checks.filter(Boolean).length / checks.length * 100)
    }
  }
})
