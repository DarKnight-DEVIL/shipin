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
  disabled,
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
        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4"
        placeholder={
          disabled
            ? "Conversation closed."
            : "Type your reply..."
        }
      />

      {!disabled && (
        <button
          onClick={onSend}
          className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-xl"
        >
          Send
        </button>
      )}
    </div>
  );
}