"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export default function ReplyBox({
  value,
  onChange,
  onSend,
  disabled = false,
}: Props) {
  return (
    <div className="space-y-3">

      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value)
        }
        rows={4}
        className="w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
        placeholder={
          disabled
            ? "Conversation closed."
            : "Type your reply..."
        }
      />

      {!disabled && (
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          className="rounded-xl bg-purple-600 px-5 py-2 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      )}

    </div>
  );
}