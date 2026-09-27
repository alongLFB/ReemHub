export type SplitInput =
  | { method: "EQUAL"; participantIds: string[] }
  | { method: "EXACT_AMOUNT"; amounts: { participantId: string; amountFils: number }[] }
  | { method: "PERCENTAGE"; percentages: { participantId: string; basisPoints: number }[] }
  | { method: "SHARES"; shares: { participantId: string; shares: number }[] };

export type ExpenseInput = {
  id: string;
  payerId: string;
  amountFils: number;
  split: SplitInput;
};

export type CalculatedSplit = {
  participantId: string;
  amountFils: number;
};

export type Settlement = {
  fromParticipantId: string;
  toParticipantId: string;
  amountFils: number;
};

function assertAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative integer number of fils");
  }
}

function allocateWeighted(
  totalFils: number,
  items: { participantId: string; weight: number }[],
) {
  assertAmount(totalFils, "totalFils");
  if (!items.length || items.some((item) => !Number.isSafeInteger(item.weight) || item.weight <= 0)) {
    throw new Error("At least one positive allocation weight is required");
  }
  if (new Set(items.map((item) => item.participantId)).size !== items.length) {
    throw new Error("A participant can only appear once in a split");
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const allocated = items.map((item) => {
    const numerator = totalFils * item.weight;
    return {
      participantId: item.participantId,
      amountFils: Math.floor(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });
  const remaining = totalFils - allocated.reduce((sum, item) => sum + item.amountFils, 0);
  allocated.sort((a, b) => b.remainder - a.remainder || a.participantId.localeCompare(b.participantId));
  for (let index = 0; index < remaining; index += 1) {
    allocated[index % allocated.length]!.amountFils += 1;
  }
  return allocated
    .map(({ participantId, amountFils }) => ({ participantId, amountFils }))
    .sort((a, b) => a.participantId.localeCompare(b.participantId));
}

export function calculateExpenseSplits(amountFils: number, split: SplitInput): CalculatedSplit[] {
  assertAmount(amountFils, "amountFils");

  if (split.method === "EQUAL") {
    return allocateWeighted(amountFils, split.participantIds.map((participantId) => ({ participantId, weight: 1 })));
  }
  if (split.method === "SHARES") {
    return allocateWeighted(amountFils, split.shares.map((item) => ({ participantId: item.participantId, weight: item.shares })));
  }
  if (split.method === "PERCENTAGE") {
    const total = split.percentages.reduce((sum, item) => sum + item.basisPoints, 0);
    if (total !== 10_000) {
      throw new Error("Percentages must total 10,000 basis points");
    }
    return allocateWeighted(amountFils, split.percentages.map((item) => ({ participantId: item.participantId, weight: item.basisPoints })));
  }

  if (!split.amounts.length || new Set(split.amounts.map((item) => item.participantId)).size !== split.amounts.length) {
    throw new Error("A participant can only appear once in a split");
  }
  split.amounts.forEach((item) => assertAmount(item.amountFils, "split amount"));
  const total = split.amounts.reduce((sum, item) => sum + item.amountFils, 0);
  if (total !== amountFils) {
    throw new Error("Exact amounts must equal the expense amount");
  }
  return [...split.amounts].sort((a, b) => a.participantId.localeCompare(b.participantId));
}

export function calculateSettlement(expenses: ExpenseInput[]): {
  splitsByExpense: Record<string, CalculatedSplit[]>;
  balances: Record<string, number>;
  settlements: Settlement[];
} {
  const balances = new Map<string, number>();
  const splitsByExpense: Record<string, CalculatedSplit[]> = {};

  for (const expense of expenses) {
    assertAmount(expense.amountFils, "expense amount");
    const splits = calculateExpenseSplits(expense.amountFils, expense.split);
    splitsByExpense[expense.id] = splits;
    balances.set(expense.payerId, (balances.get(expense.payerId) ?? 0) + expense.amountFils);
    for (const split of splits) {
      balances.set(split.participantId, (balances.get(split.participantId) ?? 0) - split.amountFils);
    }
  }

  const creditors = [...balances.entries()]
    .filter(([, balance]) => balance > 0)
    .map(([participantId, amountFils]) => ({ participantId, amountFils }))
    .sort((a, b) => b.amountFils - a.amountFils || a.participantId.localeCompare(b.participantId));
  const debtors = [...balances.entries()]
    .filter(([, balance]) => balance < 0)
    .map(([participantId, amountFils]) => ({ participantId, amountFils: -amountFils }))
    .sort((a, b) => b.amountFils - a.amountFils || a.participantId.localeCompare(b.participantId));

  const settlements: Settlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]!;
    const debtor = debtors[debtorIndex]!;
    const amountFils = Math.min(creditor.amountFils, debtor.amountFils);
    settlements.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountFils,
    });
    creditor.amountFils -= amountFils;
    debtor.amountFils -= amountFils;
    if (creditor.amountFils === 0) creditorIndex += 1;
    if (debtor.amountFils === 0) debtorIndex += 1;
  }

  return {
    splitsByExpense,
    balances: Object.fromEntries(balances),
    settlements,
  };
}

export function formatAed(fils: number) {
  return "AED " + (fils / 100).toFixed(2);
}
