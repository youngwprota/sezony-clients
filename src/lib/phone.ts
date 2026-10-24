/** Приводит номер к виду +375291234567. Номер без кода страны дополняется кодом салона. */
export function normalizePhone(raw: string, countryCode: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) {
    const code = countryCode.replace(/\D/g, "");
    // белорусские номера часто пишут через «8 0»: 8 029 123-45-67
    if (code === "375" && digits.startsWith("80")) digits = digits.slice(2);
    if (!digits.startsWith(code)) digits = code + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}
