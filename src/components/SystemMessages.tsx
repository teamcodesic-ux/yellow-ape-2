type SystemMessagesProps = {
  configError: string | null;
  stateError: string | null;
  uiError: string | null;
  uiMessage: string | null;
};

export function SystemMessages({
  configError,
  stateError,
  uiError,
  uiMessage,
}: SystemMessagesProps) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">System Messages</h2>
      <div className="mt-3 space-y-2 text-sm">
        {configError ? (
          <p className="rounded-lg bg-rose-100 px-3 py-2 text-rose-900">{configError}</p>
        ) : null}
        {stateError ? (
          <p className="rounded-lg bg-rose-100 px-3 py-2 text-rose-900">{stateError}</p>
        ) : null}
        {uiError ? (
          <p className="rounded-lg bg-rose-100 px-3 py-2 text-rose-900">{uiError}</p>
        ) : null}
        {uiMessage ? (
          <p className="rounded-lg bg-emerald-100 px-3 py-2 text-emerald-900">{uiMessage}</p>
        ) : null}
        {!configError && !stateError && !uiError && !uiMessage ? (
          <p className="text-zinc-500">No messages.</p>
        ) : null}
      </div>
    </div>
  );
}
