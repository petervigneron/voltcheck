import { VinForm } from "@/components/VinForm";

export default function VinTool() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">VIN check</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Shopping somewhere else? Paste any EV’s VIN and get the same report our listings carry:
        the pack this exact car has, heat pump, fast-charge status, what the warranty does on
        resale, and the questions to ask the seller.
      </p>
      <div className="mt-6">
        <VinForm />
      </div>
    </div>
  );
}
