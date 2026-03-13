const FLAGS: Record<string, string> = {
  FR: "🇫🇷",
  IT: "🇮🇹",
  ES: "🇪🇸",
  JP: "🇯🇵",
  US: "🇺🇸",
  DE: "🇩🇪",
  GB: "🇬🇧",
  PT: "🇵🇹",
  NL: "🇳🇱",
  CZ: "🇨🇿",
  AT: "🇦🇹",
  HU: "🇭🇺",
};

/**
 * Get flag emoji for a country code.
 * @param countryCode - ISO 3166-1 alpha-2 country code
 */
export function getFlag(countryCode: string): string {
  return FLAGS[countryCode] ?? "🏳️";
}
