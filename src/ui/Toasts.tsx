import { useAir, useApp } from './context';
import { Check } from './icons';

export function Toasts() {
  const { air } = useApp();
  const toasts = useAir((s) => s.toasts);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div class={`toast ${t.tone ?? ''}`} key={t.id}>
          {t.tone === 'ok' && <Check size={14} />}
          <span class="grow">{t.text}</span>
          {t.action && (
            <button
              type="button"
              class="link strong"
              onClick={() => {
                t.action!.run();
                air.dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
