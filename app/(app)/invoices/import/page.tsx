import { redirect } from "next/navigation";

export default function ImportPage() {
  redirect("/invoices/new?tab=csv");
}
