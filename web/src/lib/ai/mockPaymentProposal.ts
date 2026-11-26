import { isAddress } from "viem";

export type PaymentProposal = {
  intent: "payment" | "not_payment" | "unclear";
  recipientAddress: string | null;
  amount: string | null;
  tokenSymbol: "tUSD8" | "unknown";
  purpose: string;
  missingInformation: string[];
  summary: string;
};

export function createMockPaymentProposal(message: string) {
  const text = message.trim();

  const paymentIntent =
    /^(please\s+)?(pay|send|transfer)\b/i.test(text);

  if (!paymentIntent) {
    const proposal: PaymentProposal = {
      intent: "not_payment",
      recipientAddress: null,
      amount: null,
      tokenSymbol: "unknown",
      purpose: "",
      missingInformation: [],
      summary: "This does not appear to be a payment request.",
    };

    return {
      proposal,
      readyForReview: false,
      requiresHumanApproval: true,
      transactionSubmitted: false,
      provider: "mock",
    };
  }

  const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
  const amountMatch = text.match(
    /\b(\d+(?:\.\d{1,6})?)\s*(tUSD8|USD8)\b/i,
  );

  const recipientAddress =
    addressMatch && isAddress(addressMatch[0])
      ? addressMatch[0]
      : null;

  const amount =
    amountMatch && Number(amountMatch[1]) > 0
      ? amountMatch[1]
      : null;

  const missingInformation: string[] = [];

  if (!recipientAddress) {
    missingInformation.push("A valid recipient wallet address");
  }

  if (!amount) {
    missingInformation.push("A valid tUSD8 payment amount");
  }

  // Prefer the explicit purpose introduced by "for".
  const purposeMatch = text.match(/\bfor\s+(.+)$/i);

  const purpose = purposeMatch
    ? purposeMatch[1]
        .replace(/[.!?]+$/, "")
        .trim()
        .replace(/^\w/, (char) => char.toUpperCase())
    : "Not specified";

  const proposal: PaymentProposal = {
    intent: "payment",
    recipientAddress,
    amount,
    tokenSymbol: amountMatch ? "tUSD8" : "unknown",
    purpose,
    missingInformation,
    summary:
      missingInformation.length === 0
        ? `Payment proposal: ${amount} tUSD8 to ${recipientAddress}.`
        : `Payment request detected. Missing: ${missingInformation.join(" and ")}.`,
  };

  return {
    proposal,
    readyForReview: missingInformation.length === 0,
    requiresHumanApproval: true,
    transactionSubmitted: false,
    provider: "mock",
  };
}
