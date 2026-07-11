import { redirect } from "next/navigation";

export default function ScanPage() {
  redirect("/invoices/new?tab=snap");
}
