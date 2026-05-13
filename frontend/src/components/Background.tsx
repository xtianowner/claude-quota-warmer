/* Soft gradient backdrop with 3 blurred color blobs. */
export function Background() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-amber-50" />
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-300/40 blur-3xl" />
      <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-fuchsia-300/30 blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 h-[26rem] w-[26rem] rounded-full bg-amber-200/40 blur-3xl" />
    </div>
  );
}
