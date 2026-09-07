/** Three pulsing dots shown while the assistant's first chunk is on its way. */
export function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center" aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-pulse [animation-delay:300ms]" />
    </span>
  );
}
