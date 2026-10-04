const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

export function formatDate(iso: string): string {
  return `${dateTime.format(new Date(iso))} UTC`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
