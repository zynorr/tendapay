export function formatMoney(amountCents: number, currency = "USDC"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USDC" ? "USD" : currency,
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime();
  const differenceInMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(differenceInMinutes) < 60) {
    return formatter.format(differenceInMinutes, "minute");
  }

  const differenceInHours = Math.round(differenceInMinutes / 60);
  if (Math.abs(differenceInHours) < 24) {
    return formatter.format(differenceInHours, "hour");
  }

  return formatter.format(Math.round(differenceInHours / 24), "day");
}

export function shortenAddress(address: string): string {
  if (address.length < 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
