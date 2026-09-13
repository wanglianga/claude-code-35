import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Booking,
  CareEvent,
  Incident,
  IncidentAction,
  MissedMedication,
  MissedReason,
  Pet,
  Room,
  ScheduleAdjustment,
  ShiftNote,
  User,
  TrialObservation,
  TrialResult,
  OrderCharge,
  FollowUp,
  AbnormalKind,
  Role,
} from './types'
import { BOOKINGS, CARE_EVENTS, INCIDENTS, PETS, ROOMS, SHIFT_NOTES, USERS } from './data/seed'
import { dateOf, localToStored, nowLocal, timeOf, toMinutes } from './lib/time'

let seq = 1000
export function uid(prefix = 'id'): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

export const MISSED_REASON_LABEL: Record<MissedReason, string> = {
  missed: '漏服（到点未喂）',
  spit_out: '宠物吐出药片',
  vomited: '服药后呕吐',
  refused: '拒服',
  other: '其他',
}

export const MISSED_STATUS_LABEL = {
  pending_review: '待店长复核',
  pending_remedy: '待补服/待方案',
  made_up: '已补服成功',
  skipped: '已跳次/不补',
} as const

// 严重漏服建议规则：服药后呕吐、吐出药片，或关键药品（抗生素/抗菌/处方类）漏服
export function suggestMissedSeverity(reason: MissedReason, medName: string): 'normal' | 'serious' {
  if (reason === 'vomited') return 'serious'
  const critical = /抗生素|抗菌|消炎|处方|心脏|癫痫|胰岛素|眼膏|蒙脱/.test(medName)
  return critical ? 'serious' : 'normal'
}

function fmtShort(iso: string): string {
  return `${dateOf(iso).slice(5)} ${timeOf(iso)}`
}

function nowIso(): string {
  // 统一存储门店本地挂钟时间（naive local，不带 Z），不做 UTC 换算
  return nowLocal()
}

interface State {
  users: User[]
  pets: Pet[]
  rooms: Room[]
  bookings: Booking[]
  incidents: Incident[]
  events: CareEvent[]
  shiftNotes: ShiftNote[]
  currentUserId: string | null

  // auth
  login: (username: string, password: string) => User | null
  logout: () => void
  currentUser: () => User | undefined
  resetDemo: () => void

  // 预约 / 资料
  createBooking: (b: Booking, petInfo?: { species: Pet['species']; avatarColor: string }) => void
  updateProfile: (bookingId: string, patch: Partial<Booking['profile']>) => void

  // 试住
  scheduleTrial: (bookingId: string, at: string, roomId: string, caregiverId: string) => void
  addObservation: (bookingId: string, o: Omit<TrialObservation, 'id' | 'recorderId' | 'at'> & { at?: string }) => void
  assessTrial: (bookingId: string, result: TrialResult, conclusion: string, roomId: string) => void

  // 入寄养 / 延长 / 结算
  startBoarding: (bookingId: string) => void
  extendBooking: (bookingId: string, extendTo: string, extraCharge?: Omit<OrderCharge, 'id'>) => void
  addCharge: (bookingId: string, charge: Omit<OrderCharge, 'id'>) => void
  checkout: (bookingId: string, handoverSummary: string, flaggedRisk: string) => void
  addFollowUp: (bookingId: string, f: Omit<FollowUp, 'id' | 'at' | 'operatorId'>) => void

  // 照护时间线
  addCareEvent: (e: Omit<CareEvent, 'id'>) => void

  // 异常协同
  openIncident: (i: Omit<Incident, 'id' | 'openedAt' | 'actions' | 'status'>) => string
  addIncidentAction: (incidentId: string, action: string) => void
  resolveIncident: (incidentId: string, resolution: string) => void

  // 班次交接
  addShiftNote: (n: Omit<ShiftNote, 'id' | 'createdAt'>) => void

  // 喂药漏服补救
  recordMissedMed: (input: {
    bookingId: string
    medicationId: string
    scheduledAt: string
    detectedAt: string
    reason: MissedReason
    petCondition: string
    severity: 'normal' | 'serious'
    notifyOwner: boolean
    notifyHospital: boolean
  }) => string
  managerReviewMissedMed: (missedId: string, note: string, approve: boolean) => void
  confirmRemedyPlan: (
    missedId: string,
    plan: {
      remediation: 'make_up' | 'skip_dose' | 'vet_advice'
      plan: string
      ownerInstruction: string
      nextSchedule?: Omit<ScheduleAdjustment, 'medicationId' | 'originalTime' | 'reason'>
    },
  ) => void
  completeMakeUp: (missedId: string, note: string, executedAt?: string) => { ok: boolean; error?: string; earliestAt?: string }
  skipDose: (missedId: string, note: string) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      users: USERS,
      pets: PETS,
      rooms: ROOMS,
      bookings: BOOKINGS,
      incidents: INCIDENTS,
      events: CARE_EVENTS,
      shiftNotes: SHIFT_NOTES,
      currentUserId: null,

      login: (username, password) => {
        const u = get().users.find((x) => x.username === username.trim() && x.password === password)
        if (u) set({ currentUserId: u.id })
        return u ?? null
      },
      logout: () => set({ currentUserId: null }),
      currentUser: () => get().users.find((u) => u.id === get().currentUserId),
      resetDemo: () =>
        set({
          bookings: BOOKINGS,
          incidents: INCIDENTS,
          events: CARE_EVENTS,
          shiftNotes: SHIFT_NOTES,
          pets: PETS,
          rooms: ROOMS,
        }),

      createBooking: (b, petInfo) =>
        set((s) => ({
          bookings: [b, ...s.bookings],
          pets: s.pets.some((p) => p.id === b.petId)
            ? s.pets.map((p) => (p.id === b.petId ? { ...p, bookings: [...p.bookings, b.id] } : p))
            : [...s.pets, {
                id: b.petId,
                name: b.petName,
                species: petInfo?.species ?? 'other',
                avatarColor: petInfo?.avatarColor ?? '#64748b',
                bookings: [b.id],
              }],
        })),

      updateProfile: (bookingId, patch) =>
        set((s) => ({
          bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, profile: { ...b.profile, ...patch } } : b)),
        })),

      scheduleTrial: (bookingId, at, roomId, caregiverId) =>
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? { ...b, status: 'trial', trial: { id: uid('t'), scheduledAt: at, roomId, caregiverId, observations: [] } }
              : b,
          ),
        })),

      addObservation: (bookingId, o) =>
        set((s) => ({
          bookings: s.bookings.map((b) => {
            if (b.id !== bookingId || !b.trial) return b
            const obs: TrialObservation = {
              ...o,
              id: uid('to'),
              at: o.at ?? nowIso(),
              recorderId: get().currentUserId ?? 'unknown',
            }
            return { ...b, trial: { ...b.trial, observations: [...b.trial.observations, obs] } }
          }),
        })),

      assessTrial: (bookingId, result, conclusion, roomId) =>
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId && b.trial
              ? {
                  ...b,
                  roomId,
                  trial: {
                    ...b.trial,
                    result,
                    conclusion,
                    roomId,
                    assessorId: get().currentUserId ?? undefined,
                    assessedAt: nowIso(),
                  },
                }
              : b,
          ),
        })),

      startBoarding: (bookingId) =>
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  status: 'boarding',
                  actualDropOffAt: b.actualDropOffAt ?? b.profile.dropOffTime,
                }
              : b,
          ),
        })),

      extendBooking: (bookingId, extendTo, extraCharge) =>
        set((s) => ({
          bookings: s.bookings.map((b) => {
            if (b.id !== bookingId) return b
            return {
              ...b,
              extended: true,
              profile: { ...b.profile, pickUpTime: extendTo },
              charges: extraCharge ? [...b.charges, { ...extraCharge, id: uid('ch') }] : b.charges,
            }
          }),
        })),

      addCharge: (bookingId, charge) =>
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId ? { ...b, charges: [...b.charges, { ...charge, id: uid('ch') }] } : b,
          ),
        })),

      checkout: (bookingId, handoverSummary, flaggedRisk) =>
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  status: 'closed',
                  actualPickUpAt: nowIso(),
                  handoverSummary,
                  flaggedRisk: flaggedRisk.trim() ? flaggedRisk : undefined,
                }
              : b,
          ),
        })),

      addFollowUp: (bookingId, f) =>
        set((s) => ({
          bookings: s.bookings.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  followUps: [
                    ...b.followUps,
                    { ...f, id: uid('fu'), at: nowIso(), operatorId: get().currentUserId ?? 'unknown' },
                  ],
                }
              : b,
          ),
        })),

      addCareEvent: (e) => set((s) => ({ events: [{ ...e, id: uid('e') }, ...s.events] })),

      openIncident: (i) => {
        const id = uid('inc')
        const firstAction: IncidentAction = {
          id: uid('a'),
          at: nowIso(),
          actorId: get().currentUserId ?? 'unknown',
          actorRole: get().users.find((u) => u.id === get().currentUserId)?.role ?? 'manager',
          action: i.title,
        }
        set((s) => ({
          incidents: [
            { ...i, id, openedAt: nowIso(), status: 'open', actions: [firstAction] },
            ...s.incidents,
          ],
        }))
        return id
      },

      addIncidentAction: (incidentId, action) =>
        set((s) => {
          const me = s.users.find((u) => u.id === s.currentUserId)
          const act: IncidentAction = {
            id: uid('a'),
            at: nowIso(),
            actorId: s.currentUserId ?? 'unknown',
            actorRole: me?.role ?? 'manager',
            action,
          }
          return {
            incidents: s.incidents.map((ic) =>
              ic.id === incidentId
                ? { ...ic, status: ic.status === 'resolved' ? 'resolved' : 'handling', actions: [...ic.actions, act] }
                : ic,
            ),
          }
        }),

      resolveIncident: (incidentId, resolution) =>
        set((s) => ({
          incidents: s.incidents.map((ic) =>
            ic.id === incidentId ? { ...ic, status: 'resolved', resolution, resolvedAt: nowIso() } : ic,
          ),
        })),

      addShiftNote: (n) =>
        set((s) => ({
          shiftNotes: [{ ...n, id: uid('s'), createdAt: nowIso() }, ...s.shiftNotes],
        })),

      recordMissedMed: (input) => {
        const s = get()
        const me = s.users.find((u) => u.id === s.currentUserId)
        const booking = s.bookings.find((b) => b.id === input.bookingId)
        if (!booking) throw new Error('订单不存在')
        const med = booking.profile.medications.find((m) => m.id === input.medicationId)
        const id = uid('mm')
        // 输入为 datetime-local，本地挂钟时间原样入库（不经时区转换）
        const scheduledAt = localToStored(input.scheduledAt)
        const detectedAt = localToStored(input.detectedAt)
        const rec: MissedMedication = {
          id,
          bookingId: booking.id,
          petId: booking.petId,
          medicationId: input.medicationId,
          medName: med?.name ?? '未知药品',
          scheduledAt,
          detectedAt,
          reason: input.reason,
          petCondition: input.petCondition,
          severity: input.severity,
          status: input.severity === 'serious' ? 'pending_review' : 'pending_remedy',
          notifyOwner: input.notifyOwner,
          notifyHospital: input.notifyHospital,
          recordedById: s.currentUserId ?? 'unknown',
        }
        const events: CareEvent[] = [
          {
            id: uid('e'),
            petId: booking.petId,
            at: detectedAt,
            type: 'medicate',
            detail: `发现漏服「${rec.medName}」（计划 ${timeOf(scheduledAt)}），原因：${MISSED_REASON_LABEL[input.reason]}；宠物状态：${input.petCondition}`,
            recorderId: s.currentUserId ?? 'unknown',
            medicationId: input.medicationId,
            medicated: false,
          },
        ]
        // 严重漏服 → 店长复核 + 异常协同单（店长/护理员/主人/医院）
        let newIncidentId: string | undefined
        let state: Partial<State> = {}
        if (input.severity === 'serious') {
          newIncidentId = uid('inc')
          rec.incidentId = newIncidentId
          const firstAction: IncidentAction = {
            id: uid('a'),
            at: nowIso(),
            actorId: s.currentUserId ?? 'unknown',
            actorRole: me?.role ?? 'caregiver',
            action: `登记严重漏服：${rec.medName}（计划 ${fmtShort(scheduledAt)}），原因：${MISSED_REASON_LABEL[input.reason]}，宠物状态：${input.petCondition}。已提交店长复核，${input.notifyOwner ? '已通知主人' : '暂未通知主人'}，${input.notifyHospital ? '已请兽医/合作医院介入' : '暂未通知医院'}。`,
          }
          state = {
            incidents: [
              {
                id: newIncidentId,
                petId: booking.petId,
                kind: 'missed_med',
                title: `${booking.petName} 严重漏服「${rec.medName}」待店长复核`,
                openedAt: nowIso(),
                openedById: s.currentUserId ?? 'unknown',
                status: 'open',
                severity: 'high',
                participants: ['manager', 'caregiver', ...(input.notifyOwner ? (['owner'] as Role[]) : []), ...(input.notifyHospital ? (['hospital'] as Role[]) : [])],
                actions: [firstAction],
              },
              ...s.incidents,
            ],
          }
          events.push({
            id: uid('e'),
            petId: booking.petId,
            at: detectedAt,
            type: 'abnormal',
            detail: `严重漏服「${rec.medName}」，已进入店长复核流程`,
            recorderId: s.currentUserId ?? 'unknown',
            abnormalKind: 'missed_med',
            incidentId: newIncidentId,
          })
        }
        set((cur) => ({
          bookings: cur.bookings.map((b) =>
            b.id === booking.id ? { ...b, missedMedications: [rec, ...(b.missedMedications ?? [])] } : b,
          ),
          events: [...events.reverse(), ...cur.events],
          ...state,
        }))
        void newIncidentId
        return id
      },

      managerReviewMissedMed: (missedId, note, approve) => {
        set((s) => {
          const target = s.bookings.flatMap((b) => b.missedMedications ?? []).find((m) => m.id === missedId)
          const reviewAction: IncidentAction | null = target?.incidentId
            ? {
                id: uid('a'),
                at: nowIso(),
                actorId: s.currentUserId ?? 'unknown',
                actorRole: 'manager',
                action: approve
                  ? `店长复核通过：${note}。转入补救方案确认，护理员按方案调整后续给药时间并通知主人。`
                  : `店长复核判定本次跳次不补：${note}。`,
              }
            : null
          return {
            bookings: s.bookings.map((b) =>
              b.missedMedications?.some((m) => m.id === missedId)
                ? {
                    ...b,
                    missedMedications: b.missedMedications.map((m) =>
                      m.id === missedId
                        ? {
                            ...m,
                            status: approve ? 'pending_remedy' : 'skipped',
                            managerReviewedAt: nowIso(),
                            managerReviewNote: note,
                          }
                        : m,
                    ),
                  }
                : b,
            ),
            // 复核后异常单由「待店长复核」转为「处理中」；驳回跳次则同步闭环
            incidents: target?.incidentId
              ? s.incidents.map((ic) =>
                  ic.id === target.incidentId
                    ? {
                        ...ic,
                        title: approve
                          ? ic.title.replace('待店长复核', '店长复核通过·补救处理中')
                          : ic.title.replace('待店长复核', '店长复核：本次跳次不补·已闭环'),
                        status: approve ? 'handling' : 'resolved',
                        resolvedAt: approve ? ic.resolvedAt : nowIso(),
                        resolution: approve ? ic.resolution : `店长复核判定本次跳次不补：${note}`,
                        actions: reviewAction ? [...ic.actions, reviewAction] : ic.actions,
                      }
                    : ic,
                )
              : s.incidents,
          }
        })
      },

      confirmRemedyPlan: (missedId, plan) => {
        set((s) => {
          const target = s.bookings.flatMap((b) => b.missedMedications ?? []).find((m) => m.id === missedId)
          let nextSchedule: ScheduleAdjustment | undefined
          if (plan.nextSchedule) {
            const missedDate = dateOf(target!.scheduledAt)
            const adj = `${plan.nextSchedule.nextDate}T${plan.nextSchedule.adjustedTime}`
            // ① 调整后时间必须晚于原计划
            if (adj <= target!.scheduledAt.slice(0, 16)) {
              throw new Error('补服时间必须晚于原计划给药时间')
            }
            // ② 服药后呕吐/吐出药片：不得当天追服，必须安排到次日或之后
            if ((target!.reason === 'vomited' || target!.reason === 'spit_out') && plan.nextSchedule.nextDate <= missedDate) {
              throw new Error('服药后呕吐/吐药的补服必须安排在次日，不得提前到当天')
            }
            nextSchedule = {
              ...plan.nextSchedule,
              medicationId: target!.medicationId,
              originalTime: target!.scheduledAt.slice(11, 16),
              reason: target!.reason,
            }
          }
          return {
            bookings: s.bookings.map((b) =>
              b.missedMedications?.some((m) => m.id === missedId)
                ? {
                    ...b,
                    missedMedications: b.missedMedications.map((m) =>
                      m.id === missedId
                        ? {
                            ...m,
                            remediation: plan.remediation,
                            plan: plan.plan,
                            ownerInstruction: plan.ownerInstruction,
                            nextSchedule,
                            planConfirmedById: s.currentUserId ?? undefined,
                            planConfirmedAt: nowIso(),
                            status: plan.remediation === 'skip_dose' ? 'skipped' : 'pending_remedy',
                          }
                        : m,
                    ),
                  }
                : b,
            ),
          }
        })
      },

      completeMakeUp: (missedId, note, executedAt) => {
        const s = get()
        const target = s.bookings.flatMap((b) => b.missedMedications ?? []).find((m) => m.id === missedId)
        if (!target) return { ok: false, error: '漏服记录不存在' }
        if (target.status === 'made_up') return { ok: false, error: '该次漏服已标记补服成功' }
        if (target.status === 'skipped') return { ok: false, error: '该次已判定跳次，不能补服' }
        if (target.status === 'pending_review') return { ok: false, error: '严重漏服尚待店长复核，复核通过后才能补服' }

        // 执行时间（门店本地挂钟时间），默认当前时间
        const madeAt = executedAt ? localToStored(executedAt) : nowIso()

        // 时间门禁：若补救方案已把补服安排到调整后的日期时间，必须到点才能标记成功，
        // 防止「次日 06:30 补服」在当天提前完成并提前闭环异常。
        if (target.nextSchedule) {
          const earliest = `${target.nextSchedule.nextDate}T${target.nextSchedule.adjustedTime}:00`
          if (madeAt < earliest) {
            return {
              ok: false,
              error: `补服计划时间为 ${target.nextSchedule.nextDate} ${target.nextSchedule.adjustedTime}，到点前不能标记成功；请按调整后时间执行，异常单在此之前保持处理中。`,
              earliestAt: earliest,
            }
          }
        }

        const closeAction: IncidentAction | null = target.incidentId
          ? { id: uid('a'), at: madeAt, actorId: s.currentUserId ?? 'unknown', actorRole: 'caregiver', action: `漏服补救完成：${target.medName} 已于 ${target.nextSchedule ? `${target.nextSchedule.nextDate} ${target.nextSchedule.adjustedTime}` : madeAt.slice(11, 16)} 补服成功。${note}，异常闭环。` }
          : null
        set((cur) => ({
          bookings: cur.bookings.map((b) =>
            b.missedMedications?.some((m) => m.id === missedId)
              ? {
                  ...b,
                  missedMedications: b.missedMedications.map((m) =>
                    m.id === missedId
                      ? { ...m, status: 'made_up', madeUpAt: madeAt, madeUpById: cur.currentUserId ?? undefined, madeUpNote: note }
                      : m,
                  ),
                }
              : b,
          ),
          events: [
            {
              id: uid('e'),
              petId: target.petId,
              at: madeAt,
              type: 'medicate',
              detail: `漏服补服成功：「${target.medName}」。${note}`,
              recorderId: cur.currentUserId ?? 'unknown',
              medicationId: target.medicationId,
              medicated: true,
              missedMakeUpId: target.id,
            },
            ...cur.events,
          ],
          // 严重漏服关联异常单同步闭环
          incidents: target.incidentId
            ? cur.incidents.map((ic) =>
                ic.id === target.incidentId
                  ? { ...ic, title: ic.title.replace(/待店长复核|店长复核通过·补救处理中/, '漏服已补服成功·已闭环'), status: 'resolved', resolvedAt: madeAt, resolution: `漏服已按方案于 ${target.nextSchedule ? `${target.nextSchedule.nextDate} ${target.nextSchedule.adjustedTime}` : madeAt.slice(11, 16)} 补服成功：${note}`, actions: closeAction ? [...ic.actions, closeAction] : ic.actions }
                  : ic,
              )
            : cur.incidents,
        }))
        return { ok: true }
      },

      skipDose: (missedId, note) => {
        const s = get()
        const target = s.bookings.flatMap((b) => b.missedMedications ?? []).find((m) => m.id === missedId)
        const madeAt = nowIso()
        const closeAction: IncidentAction | null = target?.incidentId
          ? { id: uid('a'), at: madeAt, actorId: s.currentUserId ?? 'unknown', actorRole: 'manager', action: `本次跳次不补服，异常闭环：${note}` }
          : null
        set((cur) => ({
          bookings: cur.bookings.map((b) =>
            b.missedMedications?.some((m) => m.id === missedId)
              ? {
                  ...b,
                  missedMedications: b.missedMedications.map((m) =>
                    m.id === missedId
                      ? { ...m, status: 'skipped', remediation: m.remediation ?? 'skip_dose', madeUpAt: madeAt, madeUpById: cur.currentUserId ?? undefined, madeUpNote: note }
                      : m,
                  ),
                }
              : b,
          ),
          incidents: target?.incidentId
            ? cur.incidents.map((ic) =>
                ic.id === target.incidentId
                  ? { ...ic, title: ic.title.replace(/待店长复核|店长复核通过·补救处理中/, '本次跳次不补·已闭环'), status: 'resolved', resolvedAt: madeAt, resolution: `店长判定本次跳次不补：${note}`, actions: closeAction ? [...ic.actions, closeAction] : ic.actions }
                  : ic,
              )
            : cur.incidents,
        }))
      },
    }),
    {
      name: 'pet-boarding-care-v2',
      version: 2,
      // 旧版本缓存直接沿用（新字段均为可选），避免版本不匹配清空演示数据
      migrate: (persisted) => persisted as State,
      partialize: (s) => ({
        bookings: s.bookings,
        incidents: s.incidents,
        events: s.events,
        shiftNotes: s.shiftNotes,
        pets: s.pets,
        rooms: s.rooms,
        currentUserId: s.currentUserId,
      }),
    },
  ),
)

// ---------- 选择器辅助 ----------
export function allMissedMeds(bookings: Booking[]): MissedMedication[] {
  return bookings
    .flatMap((b) => (b.missedMedications ?? []).map((m) => ({ m, booking: b })))
    .sort((a, z) => (a.m.detectedAt < z.m.detectedAt ? 1 : -1))
    .map((x) => x.m)
}

export interface EffectiveMedRow {
  medId: string
  name: string
  dosage: string
  time: string // 实际提醒时间（可能被补救方案调整）
  originalTime: string
  status: 'pending' | 'done' | 'missed_pending_review' | 'missed_pending_remedy' | 'made_up' | 'skipped'
  note?: string
  missedId?: string
}

// 计算某日的有效喂药计划：套用漏服补救方案的时间调整与补服状态（均按门店本地挂钟时间）
export function effectiveMedPlan(booking: Booking, events: CareEvent[], dateStr: string): EffectiveMedRow[] {
  const rows: EffectiveMedRow[] = []
  const dayMeds = events
    .filter((e) => e.petId === booking.petId && e.type === 'medicate' && dateOf(e.at) === dateStr)
  const missedList = booking.missedMedications ?? []

  booking.profile.medications.forEach((med) => {
    med.times.forEach((t) => {
      // 同日漏服：该时间点替换为漏服/补救状态（可能已调整到当日更晚时间）
      const missed = missedList.find(
        (m) => m.medicationId === med.id && dateOf(m.scheduledAt) === dateStr && timeOf(m.scheduledAt) === t,
      )
      if (missed) {
        const sameDayAdj = missed.nextSchedule?.nextDate === dateStr ? missed.nextSchedule : undefined
        const statusMap = {
          pending_review: 'missed_pending_review',
          pending_remedy: 'missed_pending_remedy',
          made_up: 'made_up',
          skipped: 'skipped',
        } as const
        rows.push({
          medId: med.id, name: med.name, dosage: med.dosage,
          time: sameDayAdj?.adjustedTime ?? t, originalTime: t,
          status: statusMap[missed.status],
          note: sameDayAdj?.frequencyNote ?? missed.petCondition,
          missedId: missed.id,
        })
        return
      }
      const hit = dayMeds.find(
        // 补服事件不计入常规时间点（补的是之前那次，不代表本次常规剂量已喂）
        (e) => e.medicationId === med.id && e.medicated && !e.missedMakeUpId && Math.abs(toMinutes(timeOf(e.at)) - toMinutes(t)) <= 90,
      )
      rows.push({
        medId: med.id, name: med.name, dosage: med.dosage, time: t, originalTime: t,
        status: hit ? 'done' : 'pending',
      })
    })
  })

  // 跨日补服：漏服发生在之前日期、补救方案把补服安排到 dateStr（额外一行，不影响当日常规剂量行）
  missedList.forEach((m) => {
    const adj = m.nextSchedule
    if (adj?.nextDate === dateStr && dateOf(m.scheduledAt) !== dateStr) {
      const statusMap = {
        pending_review: 'missed_pending_review',
        pending_remedy: 'missed_pending_remedy',
        made_up: 'made_up',
        skipped: 'skipped',
      } as const
      rows.push({
        medId: m.medicationId, name: m.medName,
        dosage: booking.profile.medications.find((x) => x.id === m.medicationId)?.dosage ?? '原剂量',
        time: adj.adjustedTime, originalTime: adj.originalTime,
        status: statusMap[m.status],
        note: `补服（原 ${dateOf(m.scheduledAt).slice(5)} ${adj.originalTime}）｜${adj.frequencyNote}`,
        missedId: m.id,
      })
    }
  })

  return rows.sort((a, z) => toMinutes(a.time) - toMinutes(z.time))
}

export function eventsOfPet(events: CareEvent[], petId: string): CareEvent[] {
  return events.filter((e) => e.petId === petId).sort((a, b) => (a.at < b.at ? 1 : -1))
}

export function incidentsOfPet(incidents: Incident[], petId: string): Incident[] {
  return incidents.filter((i) => i.petId === petId).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
}

export function openIncidentCount(incidents: Incident[], petId: string): number {
  return incidents.filter((i) => i.petId === petId && i.status !== 'resolved').length
}

export function bookingOfPet(bookings: Booking[], petId: string): Booking | undefined {
  // 当前进行中的订单优先，否则取最新
  const active = bookings.filter((b) => b.petId === petId && b.status !== 'closed')
  return active.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? bookings.find((b) => b.petId === petId)
}

export const ABNORMAL_LABEL: Record<AbnormalKind, string> = {
  refuse_food: '拒食',
  vomit: '呕吐',
  diarrhea: '腹泻',
  bite_staff: '咬伤员工',
  incomplete_vaccine: '疫苗记录不全',
  extend: '主人临时延长寄养',
  missed_med: '严重喂药漏服',
  other: '其他异常',
}

export const ROLE_LABEL: Record<Role, string> = {
  manager: '店长',
  caregiver: '护理员',
  owner: '宠物主人',
  hospital: '合作医院',
}
