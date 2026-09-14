import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, uid, isPetBlocked } from '../store'
import { localToStored, nowLocal, todayLocal } from '../lib/time'
import { Field } from '../components/ui'
import type { Level, Medication, Vaccine } from '../types'

const VACCINE_DEFAULTS = ['狂犬疫苗', '联合疫苗（犬四联/猫三联）']
const LEVELS: Level[] = ['none', 'mild', 'moderate', 'severe']
const LEVEL_TEXT: Record<Level, string> = { none: '无', mild: '轻度', moderate: '中度', severe: '严重' }

export default function BookingForm() {
  const { users, pets, currentUser, createBooking } = useStore()
  const me = currentUser()!
  const nav = useNavigate()
  const isManager = me.role === 'manager'

  const owners = users.filter((u) => u.role === 'owner')
  const [ownerId, setOwnerId] = useState(isManager ? owners[0]?.id ?? '' : me.id)
  const myPets = pets.filter((p) => p.bookings.length > 0 && bookingsHaveOwner(p.bookings, ownerId, useStore.getState().bookings))
  const [petChoice, setPetChoice] = useState<'new' | string>('new')
  const [petName, setPetName] = useState('')
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other'>('dog')

  const [breed, setBreed] = useState('')
  const [ageYears, setAgeYears] = useState(1)
  const [ageMonths, setAgeMonths] = useState(0)
  const [weightKg, setWeightKg] = useState<number | ''>('')
  const [neutered, setNeutered] = useState<boolean | null>(null)
  const [vaccines, setVaccines] = useState<Vaccine[]>(
    VACCINE_DEFAULTS.map((name) => ({ name, done: false })),
  )
  const [vaccineName, setVaccineName] = useState('')
  const [allergies, setAllergies] = useState('无')
  const [aggression, setAggression] = useState<Level>('none')
  const [aggressionNote, setAggressionNote] = useState('')
  const [separationAnxiety, setSeparationAnxiety] = useState<Level>('none')
  const [dietHabit, setDietHabit] = useState('')
  const [dropOffTime, setDropOffTime] = useState('2026-09-14T10:00')
  const [pickUpTime, setPickUpTime] = useState('2026-09-19T18:00')
  const [medications, setMedications] = useState<Medication[]>([])
  const [medDraft, setMedDraft] = useState({ name: '', dosage: '', times: '08:00', route: '口服', note: '' })
  const [err, setErr] = useState('')
  const [forceAccept, setForceAccept] = useState(false)

  const selectedRejections = petChoice !== 'new' ? (pets.find((p) => p.id === petChoice)?.rejections ?? []) : []
  const selectedBlocked = petChoice !== 'new' && isPetBlocked(pets, petChoice)

  function addMed() {
    if (!medDraft.name.trim()) return
    setMedications([
      ...medications,
      {
        id: uid('med'),
        name: medDraft.name.trim(),
        dosage: medDraft.dosage.trim() || '按医嘱',
        times: medDraft.times.split(/[,，\s]+/).filter(Boolean),
        route: medDraft.route,
        note: medDraft.note.trim() || undefined,
      },
    ])
    setMedDraft({ name: '', dosage: '', times: '08:00', route: '口服', note: '' })
  }

  function submit() {
    const name = petChoice === 'new' ? petName.trim() : pets.find((p) => p.id === petChoice)?.name ?? ''
    if (!name) return setErr('请填写宠物名字')
    if (!breed.trim()) return setErr('请填写品种')
    if (neutered == null) return setErr('请选择绝育情况')
    if (!dietHabit.trim()) return setErr('请填写饮食习惯')
    if (selectedBlocked && !forceAccept) {
      return setErr('该宠物档案有硬性拒收记录（见下方红色提示）。主人不可再次预约；如确认已具备接收条件，须由店长勾选强制覆核。')
    }
    if (!vaccines.some((v) => v.done)) {
      if (!confirm('疫苗记录全部未勾选，到店后可能只能安排隔离/单独照护甚至无法接收。确认继续提交？')) return
    }
    const owner = users.find((u) => u.id === ownerId)!
    const petId = petChoice === 'new' ? uid('p') : petChoice
    const colors = ['#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#ec4899', '#10b981']
    createBooking(
      {
        id: uid('b'),
        code: 'JY' + todayLocal().replace(/-/g, '') + String(Math.floor(Math.random() * 900) + 100),
        petId,
        petName: name,
        ownerId,
        ownerName: owner.name,
        createdAt: nowLocal(),
        status: 'intake',
        profile: {
          breed: breed.trim(),
          ageYears, ageMonths,
          weightKg: weightKg === '' ? undefined : Number(weightKg),
          vaccines, neutered,
          allergies: allergies.trim() || '无',
          aggression, aggressionNote: aggressionNote.trim() || undefined,
          separationAnxiety,
          dietHabit: dietHabit.trim(),
          medications,
          dropOffTime: localToStored(dropOffTime),
          pickUpTime: localToStored(pickUpTime),
        },
        charges: [],
        depositPaid: 0,
        followUps: [],
      },
      petChoice === 'new'
        ? { species, avatarColor: colors[pets.length % colors.length] }
        : undefined,
    )
    nav('/bookings')
  }

  return (
    <div>
      <h1>寄养预约登记</h1>
      <p className="muted">主人预约时完整填写宠物资料，门店据此安排试住并评估风险（疫苗/攻击性为关键项）。</p>

      <div className="card">
        <h2>① 宠物与主人</h2>
        <div className="form-grid">
          {isManager && (
            <Field label="主人账号"><select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setPetChoice('new') }}>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}（@{o.username}）</option>)}
            </select></Field>
          )}
          {myPets.length > 0 && (
            <Field label="选择已有宠物或新建">
              <select value={petChoice} onChange={(e) => { setPetChoice(e.target.value as 'new' | string); setForceAccept(false) }}>
                <option value="new">＋ 为新宠物建档</option>
                {myPets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          {petChoice === 'new' && (
            <>
              <Field label="宠物名字"><input value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="如 奶茶" /></Field>
              <Field label="种类">
                <select value={species} onChange={(e) => setSpecies(e.target.value as 'dog' | 'cat' | 'other')}>
                  <option value="dog">犬</option><option value="cat">猫</option><option value="other">其他</option>
                </select>
              </Field>
            </>
          )}
        </div>
      </div>

      {selectedRejections.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--red)' }}>
          <h2>⚠ 该宠物有试住拒收 / 接单限制记录（{selectedRejections.length}）</h2>
          {selectedRejections.map((r) => (
            <div key={r.id} className="summary-box" style={{ background: r.blocking ? '#fee2e2' : '#fffbeb', borderColor: r.blocking ? '#fecaca' : '#fde68a', marginBottom: 8 }}>
              <div><b>{r.blocking ? '🚫 硬性拒收（再次预约受限）' : '历史处置'}</b> · {r.at.slice(0, 16).replace('T', ' ')} · 订单 {r.bookingCode} · 店长 {r.managerName}</div>
              <div style={{ marginTop: 4 }}>{r.reason}</div>
              {r.resolution && <div className="small muted" style={{ marginTop: 4 }}>处理结果：{r.resolution}</div>}
            </div>
          ))}
          {selectedBlocked && (
            isManager ? (
              <label className="checkbox-row" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={forceAccept} onChange={(e) => setForceAccept(e.target.checked)} />
                我是店长，已重新核验（行为评估/疫苗已补齐等），强制覆核接单限制并继续预约
              </label>
            ) : (
              <div className="badge badge-red">主人无法自行再次预约该宠物，请联系门店由店长核验后处理</div>
            )
          )}
        </div>
      )}

      <div className="card">
        <h2>② 基础资料</h2>
        <div className="form-grid">
          <Field label="品种（含物种）"><input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="如 柯基（犬）/ 英短（猫）" /></Field>
          <Field label="体重 kg（选填）"><input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value === '' ? '' : Number(e.target.value))} /></Field>
          <Field label="年龄（岁）"><input type="number" min={0} value={ageYears} onChange={(e) => setAgeYears(Number(e.target.value))} /></Field>
          <Field label="月龄"><input type="number" min={0} max={11} value={ageMonths} onChange={(e) => setAgeMonths(Number(e.target.value))} /></Field>
          <Field label="绝育情况">
            <div className="row">
              {[['已绝育', true], ['未绝育', false], ['不清楚', null]].map(([t, v]) => (
                <button type="button" key={String(v)} className="btn-sm"
                  style={{ background: neutered === v ? 'var(--primary)' : '#fff', color: neutered === v ? '#fff' : '#6b7280', border: '1px solid var(--border)' }}
                  onClick={() => setNeutered(v as boolean | null)}>{t as string}</button>
              ))}
            </div>
          </Field>
          <Field label="攻击性等级">
            <select value={aggression} onChange={(e) => setAggression(e.target.value as Level)}>
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_TEXT[l]}</option>)}
            </select>
          </Field>
          <Field label="分离焦虑等级" full>
            <select value={separationAnxiety} onChange={(e) => setSeparationAnxiety(e.target.value as Level)}>
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_TEXT[l]}</option>)}
            </select>
          </Field>
          <Field label="攻击性/护食等行为补充" full><textarea value={aggressionNote} onChange={(e) => setAggressionNote(e.target.value)} placeholder="如：护食、对陌生人扑咬警告、需双扣牵引…" /></Field>
          <Field label="过敏史（药物/食物/环境，无则填“无”）" full><input value={allergies} onChange={(e) => setAllergies(e.target.value)} /></Field>
          <Field label="饮食习惯（粮品牌/顿数/食量/忌口）" full><textarea value={dietHabit} onChange={(e) => setDietHabit(e.target.value)} placeholder="如：渴望鸡肉粮，每日 2 顿 08:00/18:00，每顿 80g，忌油腻零食" /></Field>
        </div>
      </div>

      <div className="card">
        <h2>③ 疫苗记录</h2>
        <div className="col">
          {vaccines.map((v, i) => (
            <div className="row" key={i}>
              <input style={{ width: 240 }} value={v.name} onChange={(e) => setVaccines(vaccines.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <label className="checkbox-row"><input type="checkbox" checked={v.done} onChange={(e) => setVaccines(vaccines.map((x, j) => j === i ? { ...x, done: e.target.checked, expiryDate: e.target.checked ? x.expiryDate ?? '2027-01-01' : undefined } : x))} />已接种且在有效期</label>
              {v.done && <input type="date" style={{ width: 160 }} value={v.expiryDate ?? ''} onChange={(e) => setVaccines(vaccines.map((x, j) => j === i ? { ...x, expiryDate: e.target.value } : x))} />}
              <button type="button" className="btn-link" onClick={() => setVaccines(vaccines.filter((_, j) => j !== i))}>删除</button>
            </div>
          ))}
          <div className="row">
            <input style={{ width: 240 }} placeholder="添加其他疫苗项" value={vaccineName} onChange={(e) => setVaccineName(e.target.value)} />
            <button type="button" className="btn-secondary btn-sm" onClick={() => { if (vaccineName.trim()) { setVaccines([...vaccines, { name: vaccineName.trim(), done: false }]); setVaccineName('') } }}>＋ 添加</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>④ 寄养期间用药</h2>
        {medications.length > 0 && (
          <table style={{ marginBottom: 10 }}>
            <thead><tr><th>药品</th><th>剂量</th><th>方式</th><th>时间点</th><th>备注</th><th></th></tr></thead>
            <tbody>
              {medications.map((m) => (
                <tr key={m.id}><td>{m.name}</td><td>{m.dosage}</td><td>{m.route}</td><td>{m.times.join(' / ')}</td><td className="small muted">{m.note ?? '—'}</td>
                  <td><button type="button" className="btn-link" onClick={() => setMedications(medications.filter((x) => x.id !== m.id))}>删除</button></td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-grid">
          <Field label="药品名"><input value={medDraft.name} onChange={(e) => setMedDraft({ ...medDraft, name: e.target.value })} placeholder="如 蒙脱石散" /></Field>
          <Field label="剂量"><input value={medDraft.dosage} onChange={(e) => setMedDraft({ ...medDraft, dosage: e.target.value })} placeholder="如 半袋（1.5g）" /></Field>
          <Field label="喂药方式">
            <select value={medDraft.route} onChange={(e) => setMedDraft({ ...medDraft, route: e.target.value })}>
              {['口服', '拌粮', '外用', '注射'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="每日时间点（逗号分隔）"><input value={medDraft.times} onChange={(e) => setMedDraft({ ...medDraft, times: e.target.value })} placeholder="08:00, 20:00" /></Field>
          <Field label="用药备注" full><input value={medDraft.note} onChange={(e) => setMedDraft({ ...medDraft, note: e.target.value })} placeholder="如 连用 3 天 / 随早餐服用" /></Field>
        </div>
        <div style={{ marginTop: 10 }}><button type="button" className="btn-secondary btn-sm" onClick={addMed}>＋ 添加用药</button></div>
      </div>

      <div className="card">
        <h2>⑤ 接送时间</h2>
        <div className="form-grid">
          <Field label="预约送达时间（寄养开始）"><input type="datetime-local" value={dropOffTime} onChange={(e) => setDropOffTime(e.target.value)} /></Field>
          <Field label="预约接回时间（寄养结束）"><input type="datetime-local" value={pickUpTime} onChange={(e) => setPickUpTime(e.target.value)} /></Field>
        </div>
      </div>

      {err && <div className="badge badge-red" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="row">
        <button onClick={submit}>提交预约，等待门店安排试住</button>
        <button className="btn-secondary" onClick={() => nav(-1)}>取消</button>
      </div>
    </div>
  )
}

function bookingsHaveOwner(bookingIds: string[], ownerId: string, allBookings: { id: string; ownerId: string }[]): boolean {
  return bookingIds.some((id) => allBookings.find((b) => b.id === id)?.ownerId === ownerId)
}
