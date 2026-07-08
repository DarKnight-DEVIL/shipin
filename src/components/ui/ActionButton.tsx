interface Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export default function ActionButton({
  children,
  loading,
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 rounded-xl font-semibold transition ${className}`}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}