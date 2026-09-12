import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Booking,
  CareEvent,
  Incident,
  IncidentAction,
  Pet,
  Room,
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

let seq = 1000
export function uid(prefix = 'id'): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

function nowIso(): string {
  // 以分钟为精度，便于演示
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
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
    }),
    {
      name: 'pet-boarding-care-v1',
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
  other: '其他异常',
}

export const ROLE_LABEL: Record<Role, string> = {
  manager: '店长',
  caregiver: '护理员',
  owner: '宠物主人',
  hospital: '合作医院',
}
