// ============ 领域模型：城市宠物寄养试住评估与照护平台 ============

export type Role = 'manager' | 'caregiver' | 'owner' | 'hospital'

export interface User {
  id: string
  username: string
  password: string
  name: string
  role: Role
  phone?: string
  hospital?: string // 合作医院名称（hospital 角色）
}

// 攻击性 / 分离焦虑 / 抓挠 等级
export type Level = 'none' | 'mild' | 'moderate' | 'severe'

// 疫苗单项
export interface Vaccine {
  name: string // 狂犬疫苗 / 三联 / 四联等
  done: boolean
  expiryDate?: string // 到期日
}

// 用药
export interface Medication {
  id: string
  name: string // 药品名
  dosage: string // 剂量，如 5mg / 半片
  times: string[] // 每日喂药时间点 ["08:00","20:00"]
  route: string // 口服 / 外用 / 拌粮
  note?: string
}

// ---- 喂药漏服补救 ----
export type MissedReason = 'missed' | 'spit_out' | 'vomited' | 'refused' | 'other'
export type MissedStatus = 'pending_review' | 'pending_remedy' | 'made_up' | 'skipped'

// 方案确认后的用药时间调整
export interface ScheduleAdjustment {
  medicationId: string
  originalTime: string // 漏服的计划时间点
  nextDate: string // YYYY-MM-DD
  adjustedTime: string // 调整后的补服/下次给药时间 HH:mm
  frequencyNote: string // 对下一班提醒频率的影响
  reason: MissedReason
}

export interface MissedMedication {
  id: string
  bookingId: string
  petId: string
  medicationId: string
  medName: string
  scheduledAt: string // 计划给药时间 ISO
  detectedAt: string // 发现时间 ISO
  reason: MissedReason // 漏服/吐出/服药后呕吐/拒服
  petCondition: string // 发现时宠物状态
  severity: 'normal' | 'serious' // 严重漏服 → 店长复核
  status: MissedStatus
  notifyOwner: boolean
  notifyHospital: boolean
  recordedById: string
  // 补救方案
  remediation?: 'make_up' | 'skip_dose' | 'vet_advice'
  plan?: string
  ownerInstruction?: string // 给主人的新喂药说明
  nextSchedule?: ScheduleAdjustment // 后续喂药时间调整
  planConfirmedById?: string
  planConfirmedAt?: string
  managerReviewedAt?: string
  managerReviewNote?: string
  // 补服执行
  madeUpAt?: string
  madeUpById?: string
  madeUpNote?: string
  // 严重漏服自动开启的异常协同单
  incidentId?: string
}

// 预约阶段宠物资料（主人填写）
export interface IntakeProfile {
  breed: string // 品种
  ageYears: number
  ageMonths: number
  weightKg?: number
  vaccines: Vaccine[]
  neutered: boolean | null // 绝育
  allergies: string // 过敏（药物/食物/环境，无则填"无"）
  aggression: Level // 攻击性
  aggressionNote?: string
  separationAnxiety: Level // 分离焦虑
  dietHabit: string // 饮食习惯：品牌/顿数/食量/忌口
  medications: Medication[] // 长期/寄养期间用药
  dropOffTime: string // 预约送达时间 ISO（寄养开始）
  pickUpTime: string // 预约接回时间 ISO（寄养结束）
}

// 试住结果
export type TrialResult =
  | 'accepted_standard' // 可接收 · 普通房
  | 'accepted_isolation' // 可接收 · 隔离房
  | 'accepted_solo' // 可接收 · 单独照护
  | 'rejected' // 暂不接收

export type TrialDimension =
  | 'interaction' // 与其他动物互动
  | 'eating' // 进食
  | 'defecation' // 排便
  | 'barking' // 吠叫
  | 'scratching' // 抓挠
  | 'rest' // 休息

// 试住观察记录（单维度可多条，按时间追加）
export interface TrialObservation {
  id: string
  at: string // ISO 时间
  dimension: TrialDimension
  level: 1 | 2 | 3 | 4 | 5 // 1 很好 … 5 很差
  detail: string
  recorderId: string
}

export interface Trial {
  id: string
  scheduledAt: string // 门店安排试住时间
  roomId?: string
  caregiverId?: string
  observations: TrialObservation[]
  result?: TrialResult
  assessorId?: string // 评估人（店长）
  assessedAt?: string
  conclusion?: string // 结论说明
}

// 照护时间线事件类型
export type CareEventType =
  | 'feed' // 喂食
  | 'medicate' // 喂药
  | 'walk' // 遛狗
  | 'clean' // 清洁
  | 'video' // 视频回传
  | 'abnormal' // 异常行为
  | 'note' // 普通备注

export type AbnormalKind =
  | 'refuse_food' // 拒食
  | 'vomit' // 呕吐
  | 'diarrhea' // 腹泻
  | 'bite_staff' // 咬伤员工
  | 'incomplete_vaccine' // 疫苗记录不全
  | 'extend' // 主人临时延长寄养
  | 'missed_med' // 严重漏服（需四方协同）
  | 'other'

export interface CareEvent {
  id: string
  petId: string
  at: string // ISO
  type: CareEventType
  detail: string
  recorderId: string
  // feed
  food?: string
  amount?: string
  appetite?: 'good' | 'normal' | 'poor' | 'refused'
  stool?: 'normal' | 'soft' | 'diarrhea' | 'none'
  // medicate
  medicationId?: string
  medicated?: boolean // 是否成功喂入
  // walk
  durationMin?: number
  // video
  videoUrl?: string
  // abnormal
  abnormalKind?: AbnormalKind
  incidentId?: string // 关联异常协同单
  // medicate：该喂药事件是某次漏服的补服（不应被计入常规计划时间点的完成判定）
  missedMakeUpId?: string
}

// 异常协同处理状态
export type IncidentStatus = 'open' | 'handling' | 'resolved'

export interface IncidentAction {
  id: string
  at: string
  actorId: string
  actorRole: Role
  action: string // 处理动作
}

export interface Incident {
  id: string
  petId: string
  kind: AbnormalKind
  title: string
  openedAt: string
  openedById: string
  status: IncidentStatus
  severity: 'low' | 'medium' | 'high'
  // 围绕同一只宠物的四方协同
  participants: Role[] // manager/caregiver/owner/hospital
  actions: IncidentAction[]
  resolution?: string
  resolvedAt?: string
  // 咬伤员工
  staffInjured?: string
  // 医院
  hospitalAdvice?: string
  // 延长寄养
  extendTo?: string // 新接回时间
  ownerConfirmed?: boolean
}

// 房间
export type RoomType = 'standard' | 'isolation' | 'solo'

export interface Room {
  id: string
  name: string
  type: RoomType
  capacity: number
}

// 订单加项 / 赔付 / 押金
export interface OrderCharge {
  id: string
  label: string
  kind: 'addon' | 'abnormal_care' | 'compensation' | 'deposit' | 'boarding'
  amount: number // 正=收费，负=赔付/退还
  note?: string
}

export interface FollowUp {
  id: string
  at: string
  channel: string // 电话/微信
  content: string
  operatorId: string
}

export interface Booking {
  id: string
  code: string // 订单号
  petId: string
  petName: string
  ownerId: string
  ownerName: string
  createdAt: string
  status: 'intake' | 'trial' | 'boarding' | 'checkout' | 'closed'
  profile: IntakeProfile
  trial?: Trial
  roomId?: string
  actualDropOffAt?: string // 实际送达（寄养起算）
  actualPickUpAt?: string // 实际接回
  extended?: boolean
  charges: OrderCharge[]
  depositPaid: number
  followUps: FollowUp[]
  // 接回时生成的护理交接摘要
  handoverSummary?: string
  // 异常宠物 → 下次接单风险提示
  flaggedRisk?: string
  // 喂药漏服补救记录
  missedMedications?: MissedMedication[]
}

export interface Pet {
  id: string
  name: string
  species: 'dog' | 'cat' | 'other'
  avatarColor: string
  bookings: string[] // booking ids
}

export interface ShiftNote {
  id: string
  shift: 'day' | 'night'
  date: string // YYYY-MM-DD
  fromManagerId?: string
  toCaregiverId?: string
  content: string
  petIds: string[] // 涉及宠物
  createdAt: string
}
