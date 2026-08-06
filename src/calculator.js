export function calculateBalances(families, expenses) {
  // Initialize balances for each family
  const balances = {};
  families.forEach((f) => {
    balances[f.id] = 0; // Net balance
  });

  expenses.forEach((exp) => {
    // Payer gets credit
    if (balances[exp.payer_id] !== undefined) {
      balances[exp.payer_id] += exp.amount;
    }

    // Calculate total members involved in this expense
    const participants = families.filter((f) =>
      exp.participant_ids.includes(f.id)
    );
    const totalMembers = participants.reduce((sum, f) => sum + f.members, 0);

    if (totalMembers > 0) {
      const costPerHead = exp.amount / totalMembers;
      // Each participating family owes their share based on member count
      participants.forEach((f) => {
        balances[f.id] -= costPerHead * f.members;
      });
    }
  });

  // Prepare for settlement
  const debtors = [];
  const creditors = [];

  families.forEach((f) => {
    const balance = balances[f.id];
    if (balance < -0.01) {
      debtors.push({ ...f, amount: -balance }); // Owes money
    } else if (balance > 0.01) {
      creditors.push({ ...f, amount: balance }); // Should receive money
    }
  });

  // Sort to optimize transactions (largest debtor pays largest creditor)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0; // Debtor index
  let j = 0; // Creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0.01) {
      transactions.push({
        from: debtor,
        to: creditor,
        amount: Number(settleAmount.toFixed(2)),
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return { balances, transactions };
}
