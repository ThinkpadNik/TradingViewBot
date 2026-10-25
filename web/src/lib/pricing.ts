import type { Market } from "@/lib/content";

export type PackageType = "response" | "guardian";

export type PriceQuote = {
  amountMinor: number;
  amountMajor: number;
  currency: "PLN" | "NOK";
  label: string;
  paymentMethods: { id: string; label: string }[];
};

const PRICES: Record<
  Market,
  Record<PackageType, { major: number; currency: "PLN" | "NOK" }>
> = {
  pl: {
    response: { major: 99, currency: "PLN" },
    guardian: { major: 249, currency: "PLN" },
  },
  no: {
    response: { major: 299, currency: "NOK" },
    guardian: { major: 799, currency: "NOK" },
  },
};

export function getPriceQuote(
  market: Market,
  packageType: PackageType,
): PriceQuote {
  const row = PRICES[market][packageType];
  const paymentMethods =
    market === "pl"
      ? [
          { id: "blik", label: "BLIK" },
          { id: "card", label: "Karta" },
        ]
      : [
          { id: "vipps", label: "Vipps" },
          { id: "card", label: "Karta" },
        ];

  return {
    amountMajor: row.major,
    amountMinor: row.major * 100,
    currency: row.currency,
    label: row.currency === "PLN" ? `${row.major} zł` : `${row.major} NOK`,
    paymentMethods,
  };
}
