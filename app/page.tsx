"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";

function clampNumber(v: string, fallback: number): number {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Math.round(n).toLocaleString("en-US");
}

function pct(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(digits)}%`;
}

function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(digits);
}

type Scenario = {
  name: "A" | "B" | "C";
  perfUplift: number; // proxy reputation, e.g. 0.05
  salesUplift: number; // e.g. 0.0025
};

export default function Page() {
  const StableNumberInput = ({
    label,
    value,
    onValue,
    prefix,
    suffix,
    inputMode = "decimal",
    step,
    min,
    format,
  }: {
    label: string;
    value: number;
    onValue: (n: number) => void;
    prefix?: string;
    suffix?: string;
    inputMode?: "numeric" | "decimal";
    step?: number;
    min?: number;
    format?: (n: number) => string;
  }) => {
    const [draft, setDraft] = useState<string>(() => (format ? format(value) : String(value)));
    const [isEditing, setIsEditing] = useState<boolean>(false);

    React.useEffect(() => {
      if (!isEditing) setDraft(format ? format(value) : String(value));
    }, [value, isEditing, format]);

    return (
      <div className="flex flex-col gap-1">
        <div className="text-sm text-neutral-600">{label}</div>
        <div className="flex items-center gap-2">
          {prefix ? <span className="text-neutral-500">{prefix}</span> : null}
          <input
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-neutral-900/10 text-neutral-900 placeholder:text-neutral-400"
            inputMode={inputMode}
            value={draft}
            min={min}
            step={step}
            onFocus={() => {
              setIsEditing(true);
              setDraft(String(Math.round(value * 1000000) / 1000000));
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setIsEditing(false);
              const raw = draft.replace(/,/g, "").trim();
              const n = Number(raw);
              const next = Number.isFinite(n) ? (min !== undefined ? Math.max(min, n) : n) : value;
              onValue(next);
              setDraft(format ? format(next) : String(next));
            }}
          />
          {suffix ? <span className="text-neutral-500">{suffix}</span> : null}
        </div>
      </div>
    );
  };

  const StablePercentInput = ({
    label,
    value,
    onChange,
    step = 0.25,
  }: {
    label: string;
    value: number; // stored as decimal fraction (e.g. 0.07)
    onChange: (n: number) => void;
    step?: number;
  }) => (
    <StableNumberInput
      label={label}
      value={Math.round(value * 10000) / 100}
      onValue={(n) => onChange(Math.max(0, n) / 100)}
      suffix="%"
      inputMode="decimal"
      step={step}
      min={0}
      format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })}
    />
  );
  // === Inputs (from your spreadsheet) ===
  const [revenue, setRevenue] = useState<number>(14_000_000); // C1

  const [marketingPct, setMarketingPct] = useState<number>(0.07); // B2
  const [contentPct, setContentPct] = useState<number>(0.2); // B3

  const [demoAllocPct, setDemoAllocPct] = useState<number>(0.5); // B5
  const [replacementPct, setReplacementPct] = useState<number>(0.6); // B6

  const [investmentYear1, setInvestmentYear1] = useState<number>(50_000); // C7

  const [grossMargin, setGrossMargin] = useState<number>(0.4); // C19

  // Scenario assumptions (rows 15–16)
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { name: "A", perfUplift: 0.05, salesUplift: 0.0025 },
    { name: "B", perfUplift: 0.1, salesUplift: 0.005 },
    { name: "C", perfUplift: 0.15, salesUplift: 0.01 },
  ]);

  const calc = useMemo(() => {
    // Sheet formulas replicated
    const marketingBudget = revenue * marketingPct; // C2 = C1*B2
    const contentBudget = marketingBudget * contentPct; // C3 = C2*B3

    const demoBudgetYear1 = contentBudget * demoAllocPct; // C5 = C3*B5
    const replacedProduction = demoBudgetYear1 * replacementPct; // C6 = C5*B6

    const demoBudgetYear2 = demoBudgetYear1 - replacedProduction; // C9 = C5-C6
    const annualSavings = demoBudgetYear1 - demoBudgetYear2; // C10 = C5-C9 (same as C6)

    const reductionPct = demoBudgetYear1 === 0 ? 0 : (demoBudgetYear1 - demoBudgetYear2) / demoBudgetYear1; // row 11

    // Payback in months (your sheet uses Investment / ReplacedProduction * 12)
    const paybackMonthsBase = replacedProduction === 0 ? Infinity : (investmentYear1 / replacedProduction) * 12; // row 12

    // 2-Year ROI (Base): (AnnualSavings - Investment) / Investment
    const roi2yBase = investmentYear1 === 0 ? Infinity : (annualSavings - investmentYear1) / investmentYear1; // row 13

    // Scenarios: incremental sales, incremental profit, ROI total, payback with upside
    const scenarioResults = scenarios.map((s) => {
      const incrementalSales = revenue * s.salesUplift; // row 17
      const incrementalProfit = incrementalSales * grossMargin; // row 20

      const roi2yTotal =
        investmentYear1 === 0
          ? Infinity
          : (annualSavings + incrementalProfit - investmentYear1) / investmentYear1; // row 21

      const paybackMonthsUpside =
        annualSavings + incrementalProfit === 0
          ? Infinity
          : (investmentYear1 / (annualSavings + incrementalProfit)) * 12; // row 22

      return { ...s, incrementalSales, incrementalProfit, roi2yTotal, paybackMonthsUpside };
    });

    return {
      marketingBudget,
      contentBudget,
      demoBudgetYear1,
      replacedProduction,
      demoBudgetYear2,
      annualSavings,
      reductionPct,
      paybackMonthsBase,
      roi2yBase,
      scenarioResults,
    };
  }, [
    revenue,
    marketingPct,
    contentPct,
    demoAllocPct,
    replacementPct,
    investmentYear1,
    grossMargin,
    scenarios,
  ]);

  const InputRow = ({
    label,
    value,
    onChange,
    prefix,
    suffix,
    step,
    min,
  }: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    prefix?: string;
    suffix?: string;
    step?: number;
    min?: number;
  }) => (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-neutral-600">{label}</div>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-neutral-500">{prefix}</span> : null}
        <input
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-neutral-900/10 text-neutral-900 placeholder:text-neutral-400"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(clampNumber(e.target.value, value))}
        />
        {suffix ? <span className="text-neutral-500">{suffix}</span> : null}
      </div>
    </div>
  );

  const PercentRow = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (n: number) => void;
  }) => (
    <InputRow
      label={label}
      value={Math.round(value * 10000) / 100} // show as percent with 2 decimals
      onChange={(n) => onChange(Math.max(0, n) / 100)}
      suffix="%"
      step={0.25}
      min={0}
    />
  );

  const setScenario = (idx: number, patch: Partial<Scenario>) => {
    setScenarios((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-200">
              <Image src="/logo.png" alt="Company Logo" width={140} height={44} priority />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                AI Content Engine — Investment Value Calculator
              </h1>
              <p className="text-sm text-neutral-600">
                Client inputs → automatic ROI, payback, and upside scenarios (matches your spreadsheet).
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* INPUTS */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">Inputs</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
  <div className="text-sm text-neutral-600">Company Revenue</div>
  <div className="flex items-center gap-2">
    <span className="text-neutral-500">$</span>
    <input
      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-neutral-900/10 text-neutral-900 placeholder:text-neutral-400"
      inputMode="numeric"
      value={formatInt(revenue)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        const n = clampNumber(raw, revenue);
        setRevenue(Math.max(0, Math.round(n)));
      }}
    />
  </div>
</div>

              <div className="flex flex-col gap-1">
  <div className="text-sm text-neutral-600">AI System Investment (Year 1)</div>
  <div className="flex items-center gap-2">
    <span className="text-neutral-500">$</span>
    <input
      className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-neutral-900/10 text-neutral-900 placeholder:text-neutral-400"
      inputMode="numeric"
      value={formatInt(investmentYear1)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        const n = clampNumber(raw, investmentYear1);
        setInvestmentYear1(Math.max(0, Math.round(n)));
      }}
    />
  </div>
</div>

              <StablePercentInput label="Marketing Budget (% of revenue)" value={marketingPct} onChange={setMarketingPct} />
              <StablePercentInput label="Content Marketing (% of marketing budget)" value={contentPct} onChange={setContentPct} />

              <StablePercentInput label="Video Demos Allocation (internal)" value={demoAllocPct} onChange={setDemoAllocPct} />
              <StablePercentInput label="Cost reduction in demo production (%)" value={replacementPct} onChange={setReplacementPct} />
              <StablePercentInput label="Gross Margin (assumption)" value={grossMargin} onChange={setGrossMargin} />
            </div>

            <div className="mt-6 border-t border-neutral-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-neutral-700">Upside scenarios (editable)</h3>

              <div className="grid gap-4">
                {scenarios.map((s, idx) => (
                  <div key={s.name} className="rounded-xl border border-neutral-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-neutral-900">Scenario {s.name}</div>
                      <div className="text-xs text-neutral-500">assumptions</div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <StableNumberInput
                          label="Performance uplift (proxy reputation)"
                          value={s.perfUplift * 100}
                          onValue={(n) => setScenario(idx, { perfUplift: Math.max(0, n) / 100 })}
                          suffix="%"
                          inputMode="decimal"
                          step={0.5}
                          min={0}
                          format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        />
                        <div className="mt-1 text-xs italic text-neutral-400">
                          Proxy metric (not in ROI math)
                        </div>
                      </div>
                      <StableNumberInput
                        label="Sales uplift (as % of revenue)"
                        value={s.salesUplift * 100}
                        onValue={(n) => setScenario(idx, { salesUplift: Math.max(0, n) / 100 })}
                        suffix="%"
                        inputMode="decimal"
                        step={0.05}
                        min={0}
                        format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-xs text-neutral-500">
              Notes: This calculator mirrors the Excel formulas (marketing → content → demos → replacement → savings; plus upside scenarios).
            </p>
          </section>

          {/* OUTPUTS */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">Core results</h2>

            <div className="overflow-hidden rounded-2xl border border-neutral-200">
              <table className="w-full text-sm text-neutral-900">
                <tbody className="divide-y divide-neutral-200">
                  <tr>
                    <td className="px-4 py-3 text-neutral-700">Marketing Budget</td>
                    <td className="px-4 py-3 text-right font-medium">{money(calc.marketingBudget)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-neutral-700">Content Marketing Budget</td>
                    <td className="px-4 py-3 text-right font-medium">{money(calc.contentBudget)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-neutral-700">Year 1 — Video Demos Budget</td>
                    <td className="px-4 py-3 text-right font-medium">{money(calc.demoBudgetYear1)}</td>
                  </tr>
                  <tr className="bg-neutral-50">
                    <td className="px-4 py-3 font-semibold text-neutral-900">Annual savings (run-rate)</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(calc.annualSavings)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-neutral-700">Cost reduction (Video Demo Budget)</td>
                    <td className="px-4 py-3 text-right font-medium">{pct(calc.reductionPct, 0)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-neutral-700">Payback (months) — base savings</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {Number.isFinite(calc.paybackMonthsBase) ? num(calc.paybackMonthsBase, 1) : "—"}
                    </td>
                  </tr>
                  <tr className="bg-neutral-100">
                    <td className="px-4 py-3 text-base font-semibold text-neutral-900">2-Year ROI (Base: cost savings)</td>
                    <td className="px-4 py-3 text-right text-base font-semibold">
                      {Number.isFinite(calc.roi2yBase) ? pct(calc.roi2yBase, 0) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="mt-8 mb-4 text-lg font-semibold text-neutral-900">Upside scenarios</h2>

            {/* Mobile: cards (no horizontal scroll) */}
            <div className="grid gap-3 md:hidden">
              {calc.scenarioResults.map((s) => (
                <div key={s.name} className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-neutral-900">Scenario {s.name}</div>
                    <div className="text-[11px] text-neutral-500">Upside</div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="text-neutral-600">Incremental sales</div>
                    <div className="text-right font-medium text-neutral-900">{money(s.incrementalSales)}</div>

                    <div className="text-neutral-600">Incremental profit</div>
                    <div className="text-right font-medium text-neutral-900">{money(s.incrementalProfit)}</div>

                    <div className="text-neutral-600">2-Year ROI (Total)</div>
                    <div className="text-right font-semibold text-neutral-900">{pct(s.roi2yTotal, 0)}</div>

                    <div className="text-neutral-600">Payback (months)</div>
                    <div className="text-right font-medium text-neutral-900">
                      {Number.isFinite(s.paybackMonthsUpside) ? num(s.paybackMonthsUpside, 1) : "—"}
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-neutral-500">
                    Total ROI = savings + incremental profit
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet/Desktop: compact table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-neutral-200 text-neutral-900 md:block">
              <table className="w-full text-sm text-neutral-900">
                <thead className="bg-neutral-100 text-neutral-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Scen.</th>
                    <th className="px-3 py-2 text-right font-semibold">Sales</th>
                    <th className="px-3 py-2 text-right font-semibold">Profit</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">ROI (2yr)</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Payback (mo)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {calc.scenarioResults.map((s) => (
                    <tr key={s.name}>
                      <td className="px-3 py-2 font-medium text-neutral-900">{s.name}</td>
                      <td className="px-3 py-2 text-right">{money(s.incrementalSales)}</td>
                      <td className="px-3 py-2 text-right">{money(s.incrementalProfit)}</td>
                      <td className="px-3 py-2 text-right font-medium">{pct(s.roi2yTotal, 0)}</td>
                      <td className="px-3 py-2 text-center">
                        {Number.isFinite(s.paybackMonthsUpside) ? num(s.paybackMonthsUpside, 1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-neutral-500">
                ROI (2yr) = savings + incremental profit
              </div>
            </div>

            <footer className="mt-4 text-xs text-neutral-500">
              Tip: You can keep the scenarios fixed (A/B/C) or let clients edit them — both are supported.
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}