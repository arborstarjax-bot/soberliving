# Payments

Weekly/monthly rent terms per resident (`payment_frequency`, `rent_amount`, `admin_fee`, `rent_due_date`).

- Rent roll + ledger; record payment (cash/check/money_order/venmo/zelle), one-time charges, adjust/write-off.
- Receipt PDFs generated per payment (`lib/payments/receipt-pdf.ts`).
- `api/cron/sweep-charges` generates due charges + reminders on the workspace's reminder settings.
