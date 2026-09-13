import type { Booking, Level, Pet, Room, TrialResult } from '../types'

export const LEVEL_LABEL: Record<Level, string> = {
  none: '无',
  mild: '轻度',
  moderate: '中度',
  severe: '严重',
}

export const LEVEL_SCORE: Record<Level, number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
}

export const RESULT_LABEL: Record<TrialResult, string> = {
  accepted_standard: '可接收 · 普通房',
  accepted_isolation: '可接收 · 隔离房',
  accepted_solo: '可接收 · 单独照护',
  rejected: '暂不接收',
}

export const RESULT_STYLE: Record<TrialResult, string> = {
  accepted_standard: 'badge-green',
  accepted_isolation: 'badge-amber',
  accepted_solo: 'badge-purple',
  rejected: 'badge-red',
}

export const DIM_LABEL: Record<string, string> = {
  interaction: '与其他动物互动',
  eating: '进食',
  defecation: '排便',
  barking: '吠叫',
  scratching: '抓挠',
  rest: '休息',
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  // naive 本地串直接按门店本地挂钟时间显示，不做时区换算
  if (!iso.endsWith('Z')) {
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
  }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtDay(iso?: string): string {
  return fmtDate(iso).slice(0, 10)
}

// 试住维度平均分（越低越好）
export function dimAverage(levels: number[]): number {
  if (!levels.length) return 0
  return levels.reduce((a, b) => a + b, 0) / levels.length
}

// 根据资料 + 试住观察推导风险等级与标签
export interface PetRisk {
  level: 'low' | 'medium' | 'high'
  score: number
  tags: string[]
}

export function computeRisk(booking: Booking, openIncidentCount: number): PetRisk {
  let score = 0
  const tags: string[] = []
  const p = booking.profile

  const vaccineIncomplete = p.vaccines.some((v) => !v.done)
  if (vaccineIncomplete) {
    score += 3
    tags.push('疫苗不全')
  }
  if (LEVEL_SCORE[p.aggression] >= 2) {
    score += 3
    tags.push(`${LEVEL_LABEL[p.aggression]}攻击性`)
  } else if (LEVEL_SCORE[p.aggression] === 1) {
    score += 1
    tags.push('轻度攻击性')
  }
  if (LEVEL_SCORE[p.separationAnxiety] >= 2) {
    score += 2
    tags.push(`${LEVEL_LABEL[p.separationAnxiety]}分离焦虑`)
  } else if (LEVEL_SCORE[p.separationAnxiety] === 1) {
    score += 1
  }
  if (p.allergies.trim() && p.allergies.trim() !== '无') {
    score += 1
    tags.push('过敏史')
  }

  if (booking.trial) {
    const obs = booking.trial.observations
    if (obs.length) {
      const avg = obs.reduce((a, o) => a + o.level, 0) / obs.length
      // 试住表现只能在表现差时上调风险，不得冲抵疫苗/攻击性等硬性风险因子
      score += Math.max(0, Math.round(avg - 2))
      const worst: Record<string, number> = {}
      obs.forEach((o) => {
        worst[o.dimension] = Math.max(worst[o.dimension] ?? 0, o.level)
      })
      if ((worst.interaction ?? 0) >= 4) tags.push('互动冲突')
      if ((worst.eating ?? 0) >= 4) tags.push('试住拒食')
      if ((worst.barking ?? 0) >= 4) tags.push('持续吠叫')
      if ((worst.scratching ?? 0) >= 4) tags.push('抓挠自伤/破坏')
    }
  }

  if (booking.flaggedRisk) score += 3
  if (openIncidentCount > 0) {
    score += openIncidentCount * 2
    tags.push(`${openIncidentCount} 起未闭环异常`)
  }
  // 未完成补救的漏服：待店长复核权重更高
  const pendingMissed = (booking.missedMedications ?? []).filter(
    (m) => m.status === 'pending_review' || m.status === 'pending_remedy',
  )
  if (pendingMissed.length) {
    score += pendingMissed.some((m) => m.status === 'pending_review') ? 2 : 1
    tags.push('漏服待补救')
  }
  if (booking.extended) tags.push('已延长寄养')

  score = Math.max(0, score)
  // 硬性底线：疫苗记录不全至少中风险，避免被试住良好表现稀释
  if (vaccineIncomplete) score = Math.max(score, 3)
  return {
    score,
    tags: Array.from(new Set(tags)),
    level: score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low',
  }
}

export const RISK_LABEL: Record<PetRisk['level'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

export const RISK_STYLE: Record<PetRisk['level'], string> = {
  low: 'badge-green',
  medium: 'badge-amber',
  high: 'badge-red',
}

// 试住结论建议（供店长参考，最终由店长确认）
export function suggestTrialResult(booking: Booking): TrialResult {
  const risk = computeRisk(booking, 0)
  const p = booking.profile
  if (risk.level === 'high' || LEVEL_SCORE[p.aggression] >= 3) return 'accepted_solo'
  if (p.vaccines.some((v) => !v.done)) return 'accepted_isolation'
  if (risk.level === 'medium') return 'accepted_isolation'
  return 'accepted_standard'
}

export function roomTypeLabel(t: Room['type']): string {
  return t === 'standard' ? '普通房' : t === 'isolation' ? '隔离房' : '单独照护间'
}

// 寄养天数（按实际送达/接回，向上取整到天，至少 1 天）
export function boardingDays(booking: Booking): number {
  const start = booking.actualDropOffAt
  const end = booking.actualPickUpAt
  if (!start) return 0
  const endTs = end ? new Date(end).getTime() : Date.now()
  const days = (endTs - new Date(start).getTime()) / 86400000
  return Math.max(1, Math.ceil(days))
}

export function petById(pets: Pet[], id: string): Pet | undefined {
  return pets.find((x) => x.id === id)
}
