import { useEffect, useRef } from 'react'
import { addDays } from 'date-fns'
import { DAY_NAMES, ymd, todayStr } from '../lib/format'

export function DateStrip({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (d: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const today = todayStr()
  const base = new Date(today + 'T00:00:00')
  const days: Date[] = []
  for (let i = -14; i <= 14; i++) days.push(addDays(base, i))

  useEffect(() => {
    const el = ref.current?.querySelector('[data-today="1"]') as HTMLElement | null
    if (el && ref.current) {
      ref.current.scrollLeft = el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2
    }
  }, [])

  return (
    <div
      ref={ref}
      className="flex gap-[7px] overflow-x-auto pb-3.5 pt-0.5 no-scrollbar"
      style={{
        // 컨테이너 폭 제한을 깨고 화면 전체 폭으로
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      {days.map((d) => {
        const key = ymd(d)
        const on = key === selected
        return (
          <div
            key={key}
            data-today={key === today ? '1' : undefined}
            className={`flex-none w-11 py-[9px] rounded-[15px] text-center shadow-card cursor-pointer transition-colors ${
              on ? 'bg-ink text-white' : 'bg-white'
            }`}
            onClick={() => onSelect(key)}
          >
            <small className={`block text-[9px] font-bold ${on ? 'text-white/55' : 'text-sub'}`}>
              {DAY_NAMES[d.getDay()]}
            </small>
            <b className="text-[16px] font-bold">{d.getDate()}</b>
          </div>
        )
      })}
    </div>
  )
}
