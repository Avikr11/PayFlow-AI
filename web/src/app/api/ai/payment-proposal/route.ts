import OpenAI from "openai";
import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { createMockPaymentProposal } from "@/lib/ai/mockPaymentProposal";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["payment", "not_payment", "unclear"],
    },
    recipientAddress: {
      type: ["string", "null"],
    },
    amount: {
      type: ["string", "null"],
    },
    tokenSymbol: {
      type: "string",
      enum: ["tUSD8", "unknown"],
    },
    purpose: {
      type: "string",
    },
    missingInformation: {
      type: "array",
      items: { type: "string" },
    },
    summary: {
      type: "string",
    },
  },
  required: [
    "intent",
    "recipientAddress",
    "amount",
    "tokenSymbol",
    "purpose",
    "missingInformation",
    "summary",
  ],
} as const;

type PaymentProposal = {
  intent: "payment" | "not_payment" | "unclear";
  recipientAddress: string | null;
  amount: string | null;
  tokenSymbol: "tUSD8" | "unknown";
  purpose: string;
  missingInformation: string[];
  summary: string;
};

export async function POST(req: Request) {
  const provider = process.env.AI_PROVIDER || "openai";

  if (provider === "mock") {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("message" in body) ||
      typeof body.message !== "string"
    ) {
      return NextResponse.json(
        { error: "A payment request message is required." },
        { status: 400 },
      );
    }

    const message = body.message.trim();

    if (!message || message.length > 2000) {
      return NextResponse.json(
        { error: "Message must contain between 1 and 2000 characters." },
        { status: 400 },
      );
    }

    return NextResponse.json(createMockPaymentProposal(message));
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI service is not configured. Add OPENAI_API_KEY to web/.env.local." },
      { status: 503 },
    );
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body) ||
    typeof body.message !== "string"
  ) {
    return NextResponse.json(
      { error: "A payment request message is required." },
      { status: 400 },
    );
  }

  const message = body.message.trim();

  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message must contain between 1 and 2000 characters." },
      { status: 400 },
    );
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            "You are the payment-intent parser for PayFlow AI.",
            "Convert the user's message into a structured payment proposal.",
            "The only supported token is tUSD8.",
            "Never invent or guess recipient addresses, amounts, or payment details.",
            "Only classify a request as payment when the user clearly requests a payment.",
            "If the recipient or amount is missing or ambiguous, use null and explain what is missing.",
            "If the message is unrelated to making a payment, use not_payment.",
            "If the intent is ambiguous, use unclear.",
            "Do not claim that a payment has been approved, signed, submitted, or completed.",
            "The proposal is only a draft for human review.",
          ].join(" "),
        },
        {
          role: "user",
          content: message,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "payment_proposal",
          strict: true,
          schema,
        },
      },
    });

    if (response.status !== "completed" || !response.output_text) {
      return NextResponse.json(
        { error: "The AI could not complete the payment analysis. Try again." },
        { status: 502 },
      );
    }

    const proposal = JSON.parse(response.output_text) as PaymentProposal;

    const validAddress =
      typeof proposal.recipientAddress === "string" &&
      isAddress(proposal.recipientAddress) &&
      proposal.recipientAddress.toLowerCase() !==
        "0x0000000000000000000000000000000000000000";

    const validAmount =
      typeof proposal.amount === "string" &&
      /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(proposal.amount) &&
      Number(proposal.amount) > 0;

    const readyForReview =
      proposal.intent === "payment" &&
      validAddress &&
      validAmount &&
      proposal.tokenSymbol === "tUSD8" &&
      proposal.missingInformation.length === 0;

    return NextResponse.json({
      proposal: {
        ...proposal,
        recipientAddress: validAddress ? proposal.recipientAddress : null,
        amount: validAmount ? proposal.amount : null,
      },
      readyForReview,
      requiresHumanApproval: true,
      transactionSubmitted: false,
    });
  } catch (error) {
    console.error("[ai/payment-proposal]", error);

    return NextResponse.json(
      { error: "AI payment analysis failed. Check the server configuration and try again." },
      { status: 502 },
    );
  }
}
