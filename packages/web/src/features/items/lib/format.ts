export function displayConversionRate(rate: string): string {
  const dot = rate.indexOf(".");
  if (dot < 0) {
    return rate;
  }
  const fraction = rate.slice(dot + 1).replace(/0+$/, "");
  return fraction === "" ? rate.slice(0, dot) : `${rate.slice(0, dot)}.${fraction}`;
}
