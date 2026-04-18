"use client";

import { useActionState, useMemo, useState } from "react";
import { createPayment } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { formatDateOnly } from "@/lib/timezone";

// Record Payment dialog. When an open charge exists for the selected
// resident, it's preselected and the amount / period / due date are
// prefilled from the charge so staff don't have to retype anything —
// they tap Record and the receipt is generated.

interface OpenCharge {
  id: string;
  resident_id: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  charge_type: string;
}

interface Props {
  houses: { id: string; name: string }[];
  residents: { id: string; full_name: string; house_id: string }[];
  openCharges: OpenCharge[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatMonthDay(iso: string) {
  // Date-only string from a `date` column — use formatDateOnly so
  // the rendered day matches the stored calendar day regardless of
  // server/browser timezone.
  return formatDateOnly(iso, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CreatePaymentDialog({ houses, residents, openCharges }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [selectedResident, setSelectedResident] = useState("");
  const [selectedChargeId, setSelectedChargeId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [state, action, pending] = useActionState(createPayment, undefined);

  const filteredResidents = selectedHouse
    ? residents.filter((r) => r.house_id === selectedHouse)
    : residents;

  const residentCharges = useMemo(
    () =>
      openCharges
        .filter((c) => c.resident_id === selectedResident)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [openCharges, selectedResident]
  );

  const selectedCharge = residentCharges.find(
    (c) => c.id === selectedChargeId
  );

  const balance = selectedCharge
    ? Number(selectedCharge.amount) - Number(selectedCharge.paid_amount)
    : null;

  const amountNum = Number(amountInput);
  const isPartial =
    balance !== null &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    amountNum < balance;

  // Amount field is kept in sync via the charge-select onChange
  // handlers below (resident change + apply-to-charge change). This
  // avoids the react-hooks/set-state-in-effect lint rule by writing
  // the derived value at the event source instead of in an effect.
  const amountForCharge = (chargeId: string): string => {
    const c = residentCharges.find((x) => x.id === chargeId);
    if (!c) return "";
    const bal = Number(c.amount) - Number(c.paid_amount);
    return bal > 0 ? bal.toFixed(2) : "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelectedHouse("");
          setSelectedResident("");
          setSelectedChargeId("");
          setAmountInput("");
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        Record Payment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>House *</Label>
              <select
                name="house_id"
                required
                value={selectedHouse}
                onChange={(e) => {
                  setSelectedHouse(e.target.value);
                  setSelectedResident("");
                  setSelectedChargeId("");
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select house</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Resident *</Label>
              <select
                name="resident_id"
                required
                value={selectedResident}
                onChange={(e) => {
                  setSelectedResident(e.target.value);
                  const firstOpen = openCharges
                    .filter((c) => c.resident_id === e.target.value)
                    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                  setSelectedChargeId(firstOpen?.id ?? "");
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select resident</option>
                {filteredResidents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {residentCharges.length > 0 && (
            <div className="space-y-2">
              <Label>Apply To Charge</Label>
              <select
                name="charge_id"
                value={selectedChargeId}
                onChange={(e) => {
                  setSelectedChargeId(e.target.value);
                  setAmountInput(amountForCharge(e.target.value));
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Unapplied (miscellaneous)</option>
                {residentCharges.map((c) => {
                  const bal = Number(c.amount) - Number(c.paid_amount);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.charge_type === "rent"
                        ? `Rent due ${formatMonthDay(c.due_date)}`
                        : `${c.charge_type.replace(/_/g, " ")} due ${formatMonthDay(c.due_date)}`}{" "}
                      · {formatCurrency(bal)} open
                    </option>
                  );
                })}
              </select>
              {selectedCharge && balance !== null && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(balance)} remaining of{" "}
                  {formatCurrency(Number(selectedCharge.amount))}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                key={selectedChargeId + "-amt"}
              />
              {isPartial && balance !== null && (
                <p className="text-xs text-amber-600 font-medium">
                  Partial payment — {formatCurrency(balance - amountNum)} will
                  remain open.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <select
                name="payment_type"
                required
                defaultValue={
                  selectedCharge?.charge_type === "admin_fee"
                    ? "fee"
                    : selectedCharge?.charge_type === "deposit"
                      ? "deposit"
                      : "rent"
                }
                key={selectedChargeId + "-type"}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="rent">Rent</option>
                <option value="deposit">Deposit</option>
                <option value="fee">Fee</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <select
              name="payment_method"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select method</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="money_order">Money Order</option>
              <option value="venmo">Venmo</option>
              <option value="zelle">Zelle</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Period Start</Label>
              <Input
                name="period_start"
                type="date"
                defaultValue={selectedCharge?.period_start ?? ""}
                key={selectedChargeId + "-ps"}
              />
            </div>
            <div className="space-y-2">
              <Label>Period End</Label>
              <Input
                name="period_end"
                type="date"
                defaultValue={selectedCharge?.period_end ?? ""}
                key={selectedChargeId + "-pe"}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                name="due_date"
                type="date"
                defaultValue={selectedCharge?.due_date ?? ""}
                key={selectedChargeId + "-dd"}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                name="paid_at"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea name="note" rows={2} placeholder="Optional note" />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Recording…" : "Record Payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
