import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { fmt } from '../lib/format'

/** 카드 공용 등장 애니메이션 — 스프링으로 살짝 부풀며 나타남 */
export const popIn = {
  initial: { opacity: 0, scale: 0.94, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 320, damping: 24, mass: 0.75 },
}

export function Card({
  children,
  className = '',
  onClick,
  style,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      {...popIn}
      whileTap={{ scale: 0.98 }}
      whileHover={onClick ? { scale: 1.01 } : undefined}
      className={`bg-card rounded-card p-[18px] shadow-card border border-black/10 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] text-sub font-semibold tracking-wide ${className}`}>
      {children}
    </div>
  )
}

export function StatNumber({
  value,
  suffix,
  size = 'lg',
  warn = false,
  className = '',
}: {
  value: number
  suffix?: string
  size?: 'lg' | 'sm'
  warn?: boolean
  className?: string
}) {
  return (
    <div
      className={`font-bold tracking-tighter tabular leading-tight ${
        size === 'lg' ? 'text-[32px]' : 'text-[24px]'
      } ${warn ? 'text-warn' : ''} ${className}`}
    >
      {fmt(value)}
      {suffix && <span className="text-[15px] font-semibold ml-0.5">{suffix}</span>}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`flex bg-[#EFEFEC] rounded-[14px] p-[3px] ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`flex-1 border-0 py-2 rounded-[11px] text-[12px] font-bold transition-all ${
            value === o.value ? 'bg-white text-ink shadow-sm' : 'bg-transparent text-sub'
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="py-6 text-center text-[12px] text-sub font-medium">{children}</div>
  )
}

export function AddButton({
  onClick,
  icon = '+',
  light = false,
}: {
  onClick: () => void
  icon?: string
  light?: boolean
}) {
  return (
    <button
      className={`w-[34px] h-[34px] rounded-[11px] border-0 text-[18px] leading-none shadow-card ${
        light ? 'bg-white text-ink text-[14px]' : 'bg-acc text-white'
      }`}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export function PageHead({
  title,
  right,
}: {
  title: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between mt-1.5 mb-3.5">
      <h1 className="text-[30px] font-extrabold tracking-tight m-0">{title}</h1>
      {right && <div className="flex gap-2">{right}</div>}
    </div>
  )
}

export function PeriodNav({
  label,
  onPrev,
  onNext,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between px-1 pb-3">
      <button
        className="w-[30px] h-[30px] rounded-full border-0 bg-white shadow-card text-[13px] text-sub"
        onClick={onPrev}
      >
        ‹
      </button>
      <b className="text-[17px] font-extrabold tracking-tight">{label}</b>
      <button
        className="w-[30px] h-[30px] rounded-full border-0 bg-white shadow-card text-[13px] text-sub"
        onClick={onNext}
      >
        ›
      </button>
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] text-sub font-bold mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export const inputCls =
  'w-full border-[1.5px] border-line rounded-xl px-3 py-[11px] font-semibold text-[14px] outline-none focus:border-[#C9C9C4] bg-white'

export function ChipRow<T extends string | null>({
  options,
  value,
  onChange,
  allowNull = false,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  allowNull?: boolean
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o, i) => (
        <span
          key={i}
          className={`rounded-[10px] px-[11px] py-[7px] text-[11px] font-semibold cursor-pointer transition-colors ${
            value === o.value ? 'bg-acc text-white' : 'bg-[#F2F2EF]'
          }`}
          onClick={() => onChange(allowNull && value === o.value ? (null as T) : o.value)}
        >
          {o.label}
        </span>
      ))}
    </div>
  )
}

export function SaveButton({
  onClick,
  children = '저장',
  disabled = false,
}: {
  onClick: () => void
  children?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      className={`w-full border-0 rounded-[14px] py-[13px] font-bold text-[13px] mt-1 ${
        disabled ? 'bg-[#DDDDD8] text-white' : 'bg-acc text-white'
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
