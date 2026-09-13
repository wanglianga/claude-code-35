// 门店统一使用「本地挂钟时间」（naive local time，不带时区后缀），
// 不做 UTC 换算，保证护理员输入的 08:00 在时间线、补救方案、主人说明、
// 当日/跨日提醒中始终是同一个本地时间，且不受浏览器/容器时区影响。

const PAD = (n: number) => String(n).padStart(2, '0')

// 当前本地时间 → 'YYYY-MM-DDTHH:mm:ss'
export function nowLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}T${PAD(d.getHours())}:${PAD(d.getMinutes())}:${PAD(d.getSeconds())}`
}

export function todayLocal(): string {
  return nowLocal().slice(0, 10)
}

// datetime-local 输入值（分钟精度）
export function nowLocalInput(): string {
  return nowLocal().slice(0, 16)
}

// datetime-local 值 → 存储用 naive 本地串（不经过 toISOString/时区转换）
export function localToStored(value: string): string {
  // 允许 'YYYY-MM-DDTHH:mm' 或带秒
  return value.length === 16 ? `${value}:00` : value
}

// 从任意时间串取本地日期 YYYY-MM-DD。
// 兼容历史数据：以 Z 结尾的旧 UTC 串按浏览器本地时区换算；naive 本地串直接截取。
export function dateOf(iso: string): string {
  if (!iso) return ''
  if (iso.endsWith('Z')) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso.slice(0, 10)
    return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`
  }
  return iso.slice(0, 10)
}

// 取 HH:mm
export function timeOf(iso: string): string {
  if (!iso) return ''
  if (iso.endsWith('Z')) {
    const d = new Date(iso)
    return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`
  }
  return iso.slice(11, 16)
}

// HH:mm → 分钟数
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// 比较「日期 + HH:mm」与某条记录的先后（均按本地挂钟时间）
export function localDateTime(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00`)
}

// 友好显示：naive 串直接替换 T；UTC 旧串按本地时区
export function fmtLocal(iso?: string): string {
  if (!iso) return '—'
  if (iso.endsWith('Z')) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())} ${PAD(d.getHours())}:${PAD(d.getMinutes())}`
  }
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}
