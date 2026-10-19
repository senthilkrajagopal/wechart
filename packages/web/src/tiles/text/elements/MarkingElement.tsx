/**
 * A Marking as read (T886, AC-522, AC-116; design 21 state C6): its
 * marking's count, or its summary, worked out by the dashboard, which holds
 * the markings.
 */
export function MarkingText({ text }: { readonly text: string }) {
  return <span className="text-value">{text}</span>;
}
