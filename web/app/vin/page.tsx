import { VinForm } from "@/components/VinForm";

// The ink band the listing and report pages open with, holding the tool.
export default function VinTool() {
  return (
    <div className="bg-ink text-paper">
      <div className="mx-auto max-w-[1100px] px-4 pt-12 pb-14">
        <h1 className="text-[34px] leading-none font-extrabold tracking-[-0.035em] sm:text-[46px]">VIN check</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-paper/70">
          Shopping somewhere else? Paste any EV’s VIN and get the same report our listings carry:
          the pack this exact car has, heat pump, fast-charge status, what the warranty does on
          resale, and the questions to ask the seller.
        </p>
        <div className="mt-7">
          <VinForm />
        </div>
      </div>
    </div>
  );
}
