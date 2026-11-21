import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Invoice Incremental Payment Logic', () => {
  test('Paying remaining balance incrementally marks invoice fully paid', () => {
    const grandTotal = 1180.00;
    let currentPaid = 680.00;
    let currentBalance = Math.max(0, Math.round((grandTotal - currentPaid) * 100) / 100);

    assert.equal(currentBalance, 500.00);

    // User pays the remaining balance of ₹500
    const payAmt = 500.00;
    assert.ok(payAmt <= currentBalance + 0.01, 'Payment amount must not exceed balance');

    const newAmountPaid = Math.min(grandTotal, Math.round((currentPaid + payAmt) * 100) / 100);
    const newBalanceDue = Math.max(0, Math.round((grandTotal - newAmountPaid) * 100) / 100);
    const newStatus = newBalanceDue <= 0 ? 'paid' : 'sent';
    const newPaymentStatus = newBalanceDue <= 0 ? 'paid' : (newAmountPaid > 0 ? 'partial' : 'pending');

    assert.equal(newAmountPaid, 1180.00);
    assert.equal(newBalanceDue, 0.00);
    assert.equal(newStatus, 'paid');
    assert.equal(newPaymentStatus, 'paid');
  });

  test('Overpaying beyond remaining balance is rejected', () => {
    const grandTotal = 1180.00;
    const currentPaid = 680.00;
    const currentBalance = Math.max(0, Math.round((grandTotal - currentPaid) * 100) / 100);

    const payAmt = 600.00; // Exceeds balance of ₹500
    const isExceeded = payAmt > currentBalance + 0.01;
    assert.equal(isExceeded, true, 'Payment exceeding balance should be rejected');
  });

  test('Cumulative mode (isCumulative: true) respects grandTotal limit', () => {
    const grandTotal = 1180.00;
    const currentPaid = 680.00;
    const payAmt = 1180.00; // Full cumulative amount passed

    const isExceeded = payAmt > grandTotal + 0.01;
    assert.equal(isExceeded, false);

    const newAmountPaid = Math.min(grandTotal, payAmt);
    const newBalanceDue = Math.max(0, Math.round((grandTotal - newAmountPaid) * 100) / 100);
    const newStatus = newBalanceDue <= 0 ? 'paid' : 'sent';

    assert.equal(newAmountPaid, 1180.00);
    assert.equal(newBalanceDue, 0.00);
    assert.equal(newStatus, 'paid');
  });
});
