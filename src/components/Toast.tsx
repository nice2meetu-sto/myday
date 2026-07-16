import { useToast } from '../stores/ui'

export function Toast() {
  const { message, action, clear } = useToast()
  if (!message) return null
  return (
    <div className="fixed left-1/2 bottom-[104px] -translate-x-1/2 bg-acc text-white text-[12px] font-bold px-[18px] py-[11px] rounded-2xl z-[60] whitespace-nowrap shadow-lg flex items-center gap-3">
      <span>{message}</span>
      {action && (
        <button
          className="border-0 bg-transparent text-hl text-[12px] font-bold underline"
          onClick={() => {
            action.fn()
            clear()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
