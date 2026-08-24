import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { fmtMoney } from "@/lib/billing";

type TrendPoint = { label: string; invoicedCents: number; receivedCents: number };

/**
 * Recharts lives only in this module so it is code-split out of the shared
 * chunk and fetched on demand when the Reports view is opened (TVA-PERF-002).
 */
export default function BillingTrendChart({
  trend,
  currency,
}: {
  trend: TrendPoint[];
  currency: string;
}) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--tvp-line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--tvp-muted)" }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--tvp-muted)" }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v: number) => fmtMoney(v, currency).replace(/,00$/, "")}
          />
          <Tooltip
            formatter={(v: number, n: string) => [fmtMoney(v, currency), n]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--tvp-line)",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="invoicedCents" name="Invoiced" fill="var(--teal-700, #0f766e)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="receivedCents" name="Received" fill="var(--teal-300, #5eead4)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
