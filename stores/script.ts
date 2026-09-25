import { defineStore } from 'pinia'
import type { Exhibit, Hall, Language, LanguageDraft, PersistedState, PublishBlocker, ScriptStatus, Segment, SegmentSyncState, VersionSnapshot } from '~/types'

export const LANGUAGES: Language[] = [
  { id: 'zh', code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { id: 'en', code: 'en-US', label: 'English', shortLabel: 'EN' },
  { id: 'ja', code: 'ja-JP', label: '日本語', shortLabel: '日' }
]

/** 原文（源语言）固定为中文，其余语言稿件均为译文 */
export const SOURCE_LANGUAGE_ID = 'zh'

const STORAGE_KEY = 'museum-script-studio-v1'

/** 由译文段落的对应关系与中文原文当前版本推导同步状态，撤销/恢复后自动重算 */
export function segmentSyncState(segment: Segment, sourceSegments: Segment[]): SegmentSyncState {
  if (!segment.source) return 'unlinked'
  const source = sourceSegments.find(item => item.id === segment.source!.sourceSegmentId)
  if (!source) return 'source-missing'
  if ((source.revision ?? 1) !== segment.source.sourceRevision) return 'pending'
  if (!segment.source.verified) return 'unverified'
  return 'verified'
}

const isStale = (state: SegmentSyncState) => state === 'pending' || state === 'source-missing'

/** 为旧数据补齐原文版本号，并按段落顺序为译文建立初始对应关系（未核对） */
function migrate(data: PersistedState) {
  for (const exhibit of data.exhibits) {
    const source = exhibit.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)
    if (source) {
      for (const segment of source.segments) {
        if (typeof segment.revision !== 'number') segment.revision = 1
      }
    }
    for (const draft of exhibit.drafts) {
      if (draft.languageId === SOURCE_LANGUAGE_ID || !source) continue
      draft.segments.forEach((segment, index) => {
        const counterpart = source.segments[index]
        if (!segment.source && counterpart) {
          segment.source = { sourceSegmentId: counterpart.id, sourceRevision: counterpart.revision ?? 1, verified: false, verifiedAt: '' }
        }
      })
    }
  }
  if (typeof data.lastPublishedAt !== 'string') data.lastPublishedAt = ''
}

const segments = (prefix: string, values: Array<[string, string, boolean?]>): Segment[] => values.map(([label, content, locked], index) => ({
  id: `${prefix}-${index + 1}`,
  label,
  content,
  locked: Boolean(locked)
}))

function demoState(): PersistedState {
  const halls: Hall[] = [
    { id: 'hall-ancient', name: '文明肇始厅', description: '史前至先秦文明，共 18 个展项' },
    { id: 'hall-silk', name: '丝路交融厅', description: '丝绸之路上的器物、信仰与生活' },
    { id: 'hall-city', name: '城市记忆厅', description: '近现代城市空间与市民生活' }
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
          status: 'approved', updatedAt: '2026-09-23T08:35:00.000Z',
          segments: segments('jade-zh', [
            ['开场定位', '这件玉琮来自距今约五千年的良渚文化。', true],
            ['器物观察', '它外方内圆，四角雕刻神人兽面纹。', true],
            ['文化含义', '玉琮常被看作沟通天地的礼器，也象征权力与身份。'],
            ['参观提示', '请沿展柜顺时针观察，触摸复制品前先使用免洗消毒液。']
          ])
        },
        {
          id: 'draft-jade-en', languageId: 'en', title: 'Jade Cong: A Ritual Object Between Heaven and Earth',
          narration: 'This jade cong was made by the Liangzhu culture. Its square exterior and circular bore embody an early Chinese vision of the cosmos.',
          accessibility: 'The object is dark green. A tactile model shows four corners, carved faces, and a central circular opening.',
          durationMinutes: 2.3, sources: 'Complete Collection of Chinese Jades, Vol. 1; Museum accession 1987-J-042',
          status: 'review', updatedAt: '2026-09-24T02:15:00.000Z',
          segments: segments('jade-en', [
            ['Introduction', 'This jade cong is about five thousand years old.', true],
            ['Visual description', 'Its square body encloses a circular opening, while spirit-and-animal motifs cover the corners.'],
            ['Meaning', 'Jade cong is understood as a ritual link between heaven and earth.']
          ])
        },
        {
          id: 'draft-jade-ja', languageId: 'ja', title: '玉琮：天と地を結ぶ礼器',
          narration: 'こちらは良渚文化の玉琮です。外側は方形、中央は円形で、四隅には神人獣面文が刻まれています。',
          accessibility: '暗い青緑色の玉製です。複製模型では四つの角と中央の円孔を触って確認できます。',
          durationMinutes: 2.6, sources: '『中国玉器全集』第一巻；収蔵資料 1987-J-042',
          status: 'draft', updatedAt: '2026-09-21T06:10:00.000Z',
          segments: segments('jade-ja', [
            ['導入', '約五千年前の良渚文化を代表する玉琮です。'],
            ['観察', '外側は方形、中央は円形で、四隅に精緻な文様があります。'],
            ['意味', '天地を結ぶ礼器として、力と身分を象徴しました。']
          ])
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
          status: 'returned', updatedAt: '2026-09-23T11:20:00.000Z',
          segments: segments('bronze-zh', [
            ['器物介绍', '这是一件商代青铜爵，用于温酒和饮酒。'],
            ['结构说明', '三足使器身稳定，前端的流便于倾倒。'],
            ['礼制背景', '青铜器数量与形制反映了使用者的身份。'],
            ['修改说明', '审校意见：补充“柱饰”的用途，并核对年代。']
          ])
        },
        {
          id: 'draft-bronze-en', languageId: 'en', title: 'Bronze Jue and Ritual Order',
          narration: 'The jue was among the earliest bronze drinking vessels. Its tripod base, pouring spout, and posts were closely tied to Shang and Zhou ritual.',
          accessibility: 'The tactile replica includes the long spout, tripod feet, and raised posts.',
          durationMinutes: 2.8, sources: 'A General Survey of Yin-Zhou Bronzes; Gallery label A-08',
          status: 'draft', updatedAt: '2026-09-22T09:00:00.000Z',
          segments: segments('bronze-en', [['Object', 'This bronze jue dates to the Shang dynasty.'], ['Structure', 'Three legs support the body; the long spout guides the pour.']])
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
        status: 'draft', updatedAt: '2026-09-20T03:00:00.000Z',
        segments: segments('silk-zh', [['序言', '丝绸不只是一种材料，也是交流的媒介。'], ['互动', '请试着推动梭子，观察经纬线如何交会。']])
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
    lastSavedAt: new Date().toISOString(),
    lastPublishedAt: ''
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
    lastPublishedAt: '',
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
    wordCount(): number {
      return (this.selectedDraft?.narration || '').replace(/\s/g, '').length
    },
    /** 当前展项的中文原文段落，作为译文对应关系的候选 */
    selectedSourceSegments(): Segment[] {
      return this.selectedExhibit?.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)?.segments || []
    },
    /** 整组发布的全部阻塞项：待同步、缺少对应关系或尚未核对的译文 */
    publishBlockers(state): PublishBlocker[] {
      const blockers: PublishBlocker[] = []
      for (const exhibit of state.exhibits) {
        const source = exhibit.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)
        if (!source) continue
        for (const draft of exhibit.drafts) {
          if (draft.languageId === SOURCE_LANGUAGE_ID) continue
          for (const segment of draft.segments) {
            const sync = segmentSyncState(segment, source.segments)
            if (sync === 'verified') continue
            blockers.push({
              exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
              languageId: draft.languageId, segmentId: segment.id,
              segmentLabel: segment.label || '未命名段落', reason: sync
            })
          }
          for (const sourceSegment of source.segments) {
            const translated = draft.segments.some(segment => segment.source?.sourceSegmentId === sourceSegment.id)
            if (!translated) {
              blockers.push({
                exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
                languageId: draft.languageId, segmentId: sourceSegment.id,
                segmentLabel: sourceSegment.label || '未命名段落', reason: 'missing-translation'
              })
            }
          }
        }
      }
      return blockers
    },
    canPublish(): boolean {
      return this.publishBlockers.length === 0
    },
    canUndo(state): boolean { return state.past.length > 0 },
    canRedo(state): boolean { return state.future.length > 0 }
  },
  actions: {
    hydrate() {
      if (this.hydrated || typeof localStorage === 'undefined') return
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const data = JSON.parse(saved) as PersistedState
          migrate(data)
          this.$patch({ ...data, hydrated: true })
          if (!this.halls.length || !this.exhibits.length) this.resetDemo()
        } catch {
          this.resetDemo()
        }
      } else {
        this.resetDemo()
      }
      this.ensureSelection()
      this.hydrated = true
    },
    resetDemo() {
      const data = demoState()
      migrate(data)
      this.$patch({ ...data, hydrated: true, past: [], future: [] })
      this.persist()
      this.notice = '示例数据已就绪，可直接开始编辑。'
    },
    snapshot(): string {
      return JSON.stringify({ halls: this.halls, exhibits: this.exhibits, versions: this.versions })
    },
    commit(mutator: () => void) {
      this.past.push(this.snapshot())
      if (this.past.length > 50) this.past.shift()
      this.future = []
      mutator()
      this.lastSavedAt = new Date().toISOString()
      this.persist()
    },
    persist() {
      if (typeof localStorage === 'undefined') return
      const data: PersistedState = {
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        selectedHallId: this.selectedHallId, selectedExhibitId: this.selectedExhibitId,
        selectedLanguageId: this.selectedLanguageId, lastSavedAt: this.lastSavedAt,
        lastPublishedAt: this.lastPublishedAt
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
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
      const changed = (patch.label !== undefined && patch.label !== segment.label)
        || (patch.content !== undefined && patch.content !== segment.content)
      if (!changed) return
      const isSource = draft.languageId === SOURCE_LANGUAGE_ID
      let affected: string[] = []
      this.commit(() => {
        Object.assign(segment, patch)
        if (isSource) {
          segment.revision = (segment.revision ?? 1) + 1
          affected = this.flagStaleTranslations(this.selectedExhibitId)
        } else if (segment.source) {
          segment.source.verified = false
        }
      })
      if (isSource) {
        this.notice = affected.length
          ? `中文原文已更新为 v${segment.revision}；${this.languageNames(affected)}译文已标记待同步并退回。`
          : `中文原文已更新为 v${segment.revision}。`
      } else if (segment.source) {
        this.notice = '译文已修改，请重新核对并确认所依据的中文版本。'
      }
    },
    toggleLock(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment) return
      const isSource = draft.languageId === SOURCE_LANGUAGE_ID
      const unlocking = segment.locked
      let affected: string[] = []
      this.commit(() => {
        segment.locked = !segment.locked
        if (isSource && unlocking) {
          segment.revision = (segment.revision ?? 1) + 1
          affected = this.flagStaleTranslations(this.selectedExhibitId)
        }
      })
      if (isSource && unlocking) {
        this.notice = affected.length
          ? `中文段落已解锁，原文升为 v${segment.revision}；${this.languageNames(affected)}译文已标记待同步并退回。`
          : `中文段落已解锁，原文升为 v${segment.revision}。`
      } else {
        this.notice = segment.locked ? '段落已锁定，避免误改。' : '段落已解锁。'
      }
    },
    addSegment() {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => draft.segments.push({
        id: `segment-${Date.now()}`,
        label: `新段落 ${draft.segments.length + 1}`,
        content: '',
        locked: false,
        ...(draft.languageId === SOURCE_LANGUAGE_ID ? { revision: 1 } : {})
      }))
    },
    removeSegment(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || segment.locked) return
      const isSource = draft.languageId === SOURCE_LANGUAGE_ID
      let affected: string[] = []
      this.commit(() => {
        draft.segments = draft.segments.filter(item => item.id !== id)
        if (isSource) affected = this.flagStaleTranslations(this.selectedExhibitId)
      })
      if (isSource && affected.length) {
        this.notice = `中文段落已移除；${this.languageNames(affected)}译文已标记待同步并退回。`
      }
    },
    /** 原文变动后扫描同展项译文：引用旧原文的段落进入待同步，所在稿件退回 */
    flagStaleTranslations(exhibitId: string): string[] {
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      const source = exhibit?.drafts.find(draft => draft.languageId === SOURCE_LANGUAGE_ID)
      if (!exhibit || !source) return []
      const affected: string[] = []
      for (const draft of exhibit.drafts) {
        if (draft.languageId === SOURCE_LANGUAGE_ID) continue
        const stale = draft.segments.some(segment => isStale(segmentSyncState(segment, source.segments)))
        if (stale && (draft.status === 'approved' || draft.status === 'review')) {
          draft.status = 'returned'
          draft.updatedAt = new Date().toISOString()
          affected.push(draft.languageId)
        }
      }
      return affected
    },
    /** 译者为段落指定对应的中文原文段落 */
    assignSource(segmentId: string, sourceSegmentId: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === segmentId)
      const source = this.selectedSourceSegments.find(item => item.id === sourceSegmentId)
      if (!draft || !segment || !source || draft.languageId === SOURCE_LANGUAGE_ID) return
      this.commit(() => {
        segment.source = { sourceSegmentId, sourceRevision: source.revision ?? 1, verified: false, verifiedAt: '' }
      })
      this.notice = '已建立对应关系，请核对译文后确认。'
    },
    /** 译者核对完成，记下所依据的中文版本 */
    verifySegment(segmentId: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === segmentId)
      if (!draft || !segment?.source || draft.languageId === SOURCE_LANGUAGE_ID) return
      const source = this.selectedSourceSegments.find(item => item.id === segment.source!.sourceSegmentId)
      if (!source) return
      const revision = source.revision ?? 1
      this.commit(() => {
        segment.source = { ...segment.source!, sourceRevision: revision, verified: true, verifiedAt: new Date().toISOString() }
      })
      this.notice = `已核对“${segment.label || '未命名段落'}”，依据中文原文 v${revision}。`
    },
    setStatus(status: ScriptStatus) {
      const draft = this.selectedDraft
      if (!draft) return
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
      let affected: string[] = []
      this.commit(() => {
        const exhibit = this.exhibits.find(item => item.id === version.exhibitId)
        if (!exhibit) return
        const index = exhibit.drafts.findIndex(item => item.languageId === version.languageId)
        const restored = JSON.parse(JSON.stringify(version.draft)) as LanguageDraft
        if (index >= 0) exhibit.drafts[index] = restored
        else exhibit.drafts.push(restored)
        if (version.languageId === SOURCE_LANGUAGE_ID) affected = this.flagStaleTranslations(version.exhibitId)
      })
      this.selectedExhibitId = version.exhibitId
      this.selectedLanguageId = version.languageId
      this.notice = affected.length
        ? `版本已恢复；${this.languageNames(affected)}译文引用的是旧原文，已标记待同步并退回。`
        : '版本已恢复，并作为一次可撤销操作保存。'
    },
    undo() {
      const state = this.past.pop()
      if (!state) return
      this.future.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已撤销上一步。'
    },
    redo() {
      const state = this.future.pop()
      if (!state) return
      this.past.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已重做。'
    },
    completionFor(exhibit: Exhibit, languageId: string): number {
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!draft) return 0
      const checks = [draft.title, draft.narration, draft.accessibility, draft.sources, draft.segments.length > 0 ? 'segments' : '']
      return Math.round(checks.filter(Boolean).length / checks.length * 100)
    },
    /** 某语言稿件中引用旧原文、等待重新同步的段落数 */
    outOfSyncCount(exhibit: Exhibit, languageId: string): number {
      if (languageId === SOURCE_LANGUAGE_ID) return 0
      const source = exhibit.drafts.find(item => item.languageId === SOURCE_LANGUAGE_ID)
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!source || !draft) return 0
      return draft.segments.filter(segment => isStale(segmentSyncState(segment, source.segments))).length
    },
    languageNames(languageIds: string[]): string {
      return languageIds.map(id => LANGUAGES.find(item => item.id === id)?.label || id).join('、')
    },
    /** 整组发布：存在待同步、缺少对应关系或尚未核对的译文时拒绝 */
    publishGroup() {
      if (this.publishBlockers.length) {
        this.notice = `仍有 ${this.publishBlockers.length} 处译文待同步、缺少对应关系或尚未核对，无法整组发布。`
        return
      }
      this.lastPublishedAt = new Date().toISOString()
      this.persist()
      this.notice = '整组发布完成：全部译文均已与当前中文原文核对。'
    }
  }
})
