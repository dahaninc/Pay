import Anthropic from "@anthropic-ai/sdk";

export interface ExtractedInvoice {
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  amount: number | null; // major units
  currency: string | null;
  invoice_no: string | null;
  issue_date: string | null; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD
  confidence: Record<string, number>; // 0–1 per field
}

const TOOL = {
  name: "record_invoice",
  description: "Record the fields extracted from an invoice document.",
  input_schema: {
    type: "object" as const,
    properties: {
      customer_name: { type: ["string", "null"], description: "The customer/recipient being billed (not the business issuing the invoice)" },
      email: { type: ["string", "null"] },
      phone: { type: ["string", "null"], description: "Customer mobile number, E.164 if possible" },
      amount: { type: ["number", "null"], description: "Total amount due, in major currency units" },
      currency: { type: ["string", "null"], enum: ["USD", "GBP", "CAD", "AUD", null] },
      invoice_no: { type: ["string", "null"] },
      issue_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      due_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      confidence: {
        type: "object",
        description: "0–1 confidence per field name above",
        additionalProperties: { type: "number" },
      },
    },
    required: ["customer_name", "amount", "confidence"],
  },
};

const SYSTEM = `You extract structured data from invoices for a reminder tool used by trades businesses (plumbers, electricians, builders).
The user of the tool is the business that ISSUED the invoice. Extract the CUSTOMER being billed, not the issuing business.
Dates must be YYYY-MM-DD. If a due date is absent but terms like "Net 14" appear, compute due_date from the issue date.
Set confidence honestly per field: 1.0 = printed clearly, 0.5 = inferred, 0 = guessed/absent. Never invent an amount.`;

export function extractionAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractInvoice(
  input:
    | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string }
    | { kind: "pdf"; base64: string }
    | { kind: "text"; text: string }
): Promise<ExtractedInvoice> {
  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] =
    input.kind === "text"
      ? [{ type: "text", text: `Extract the invoice fields from this email:\n\n${input.text.slice(0, 20000)}` }]
      : input.kind === "pdf"
        ? [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } },
            { type: "text", text: "Extract the invoice fields from this document." },
          ]
        : [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } },
            { type: "text", text: "Extract the invoice fields from this photo of an invoice." },
          ];

  const response = await client.messages.create({
    model: process.env.EXTRACTION_MODEL || "claude-sonnet-5",
    max_tokens: 1000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_invoice" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("extraction returned no result");
  const raw = toolUse.input as Record<string, unknown>;

  return {
    customer_name: (raw.customer_name as string) ?? null,
    email: (raw.email as string) ?? null,
    phone: (raw.phone as string) ?? null,
    amount: typeof raw.amount === "number" ? raw.amount : null,
    currency: (raw.currency as string) ?? null,
    invoice_no: (raw.invoice_no as string) ?? null,
    issue_date: (raw.issue_date as string) ?? null,
    due_date: (raw.due_date as string) ?? null,
    confidence: (raw.confidence as Record<string, number>) ?? {},
  };
}
