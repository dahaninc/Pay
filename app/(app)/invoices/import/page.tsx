import { CsvImport } from "@/components/CsvImport";

export default function ImportPage() {
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1">Import invoices</h1>
      <p className="text-ink-600 text-sm mb-5">
        Export a CSV from QuickBooks, Jobber or a spreadsheet, drop it here.
      </p>
      <CsvImport />
    </div>
  );
}
