export function isStaticDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export function getTicketHref(ticketId: string): string {
  if (isStaticDemoMode()) {
    return `/tickets/detail?id=${encodeURIComponent(ticketId)}`;
  }
  return `/tickets/${encodeURIComponent(ticketId)}`;
}
