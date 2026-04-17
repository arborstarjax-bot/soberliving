"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/signature-pad";
import { completeIntakeReview, getRoomsForHouse } from "./actions";
import { Plus, Trash2 } from "lucide-react";

interface CheckInRestriction {
  restriction_type: string;
  description: string;
  end_date: string;
}

interface House {
  id: string;
  name: string;
  address: string | null;
}

interface Room {
  id: string;
  name: string;
  beds: { id: string; label: string; is_active: boolean }[];
}

interface IntakeReviewFormProps {
  userId: string;
  userName: string;
  houses: House[];
}

export function IntakeReviewForm({ userId, userName, houses }: IntakeReviewFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [houseId, setHouseId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [bedId, setBedId] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [paymentFrequency, setPaymentFrequency] = useState<"weekly" | "monthly">("monthly");
  const [rentAmount, setRentAmount] = useState("800");
  const [adminFee, setAdminFee] = useState("200");
  const [rentDueDate, setRentDueDate] = useState("1st of each month");
  const [commitmentStartDate, setCommitmentStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [commitmentTerm, setCommitmentTerm] = useState("181 days");
  const [notes, setNotes] = useState("");
  const [checkInRestrictions, setCheckInRestrictions] = useState<CheckInRestriction[]>([]);
  const [staffSignature, setStaffSignature] = useState<string | null>(null);

  // Move-in payment state. Default to "not collected" so admins have
  // to make an affirmative choice rather than silently submitting with
  // zero payment.
  const [moveInNoPayment, setMoveInNoPayment] = useState(false);
  const [moveInAmount, setMoveInAmount] = useState("");
  const [moveInMethod, setMoveInMethod] = useState<
    "cash" | "check" | "money_order" | "venmo" | "zelle" | "other"
  >("cash");
  const [moveInPaidAt, setMoveInPaidAt] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [moveInNote, setMoveInNote] = useState("");

  // Derived move-in totals. The form lets the admin change rent /
  // admin fee interactively so the expected total tracks those.
  const parsedRent = parseFloat(rentAmount);
  const parsedAdminFee = parseFloat(adminFee);
  const expectedMoveInTotal =
    (Number.isFinite(parsedRent) ? parsedRent : 0) +
    (Number.isFinite(parsedAdminFee) ? parsedAdminFee : 0);
  const parsedMoveInAmount = parseFloat(moveInAmount);
  const collectedAmount = Number.isFinite(parsedMoveInAmount)
    ? parsedMoveInAmount
    : 0;
  const isPartialPayment =
    !moveInNoPayment &&
    collectedAmount > 0 &&
    collectedAmount < expectedMoveInTotal;

  async function handleHouseChange(newHouseId: string) {
    setHouseId(newHouseId);
    setRoomId("");
    setBedId("");
    setRooms([]);

    if (!newHouseId) return;

    setLoadingRooms(true);
    try {
      const result = await getRoomsForHouse(newHouseId);
      setRooms(result as Room[]);
    } finally {
      setLoadingRooms(false);
    }
  }

  const selectedRoom = rooms.find((r) => r.id === roomId);
  const availableBeds = selectedRoom?.beds.filter((b) => b.is_active) ?? [];

  function handleSubmit() {
    setError(null);

    if (!houseId) return setError("Please select a house");
    if (!roomId) return setError("Please select a room");
    if (!bedId) return setError("Please select a bed");
    if (!staffSignature) return setError("Staff signature is required");

    const rent = parseFloat(rentAmount);
    const fee = parseFloat(adminFee);
    if (isNaN(rent) || rent <= 0) return setError("Invalid rent amount");
    if (isNaN(fee) || fee < 0) return setError("Invalid admin fee");

    // Move-in payment validation. Either the admin has ticked
    // "no payment collected", or they've entered a real amount
    // (> 0) with a method. If the payment is partial (less than
    // the expected total) they must leave a note.
    let moveInPayload: {
      amount: number;
      method: typeof moveInMethod;
      paidAt: string;
      note?: string;
    } | null = null;
    if (!moveInNoPayment) {
      if (!Number.isFinite(parsedMoveInAmount) || parsedMoveInAmount <= 0) {
        return setError(
          'Enter the amount collected at move-in, or check "No payment collected at move-in"'
        );
      }
      if (!moveInPaidAt) {
        return setError("Select a payment date");
      }
      if (parsedMoveInAmount < expectedMoveInTotal && !moveInNote.trim()) {
        return setError(
          "Partial move-in payments require a note explaining the arrangement"
        );
      }
      moveInPayload = {
        amount: parsedMoveInAmount,
        method: moveInMethod,
        paidAt: moveInPaidAt,
        note: moveInNote.trim() || undefined,
      };
    }

    startTransition(async () => {
      const result = await completeIntakeReview({
        userId,
        houseId,
        roomId,
        bedId,
        paymentFrequency,
        rentAmount: rent,
        adminFee: fee,
        rentDueDate,
        commitmentStartDate,
        commitmentTerm,
        notes: notes || undefined,
        staffSignature,
        checkInRestrictions: checkInRestrictions.length > 0 ? checkInRestrictions : undefined,
        moveInPayment: moveInPayload,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="font-medium text-green-800">
          Intake review completed for {userName}!
        </p>
        <p className="text-sm text-green-600 mt-1">
          The house commitment agreement is now ready for the resident to sign.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 border-t pt-4">
      <h3 className="font-semibold text-lg">Housing Assignment & Rent Configuration</h3>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Housing Assignment */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>House *</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={houseId}
            onChange={(e) => handleHouseChange(e.target.value)}
          >
            <option value="">Select house...</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Room *</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setBedId("");
            }}
            disabled={!houseId || loadingRooms}
          >
            <option value="">
              {loadingRooms ? "Loading..." : "Select room..."}
            </option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Bed *</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={bedId}
            onChange={(e) => setBedId(e.target.value)}
            disabled={!roomId}
          >
            <option value="">Select bed...</option>
            {availableBeds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rent Configuration */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>Payment Frequency *</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={paymentFrequency}
            onChange={(e) => setPaymentFrequency(e.target.value as "weekly" | "monthly")}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Sober Living Fee *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="pl-7"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Administrative Fee *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="pl-7"
              value={adminFee}
              onChange={(e) => setAdminFee(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Rent Due Date *</Label>
          <Input
            value={rentDueDate}
            onChange={(e) => setRentDueDate(e.target.value)}
            placeholder="e.g. 1st of each month"
          />
        </div>

        <div className="space-y-2">
          <Label>Commitment Start Date *</Label>
          <Input
            type="date"
            value={commitmentStartDate}
            onChange={(e) => setCommitmentStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Commitment Term *</Label>
          <Input
            value={commitmentTerm}
            onChange={(e) => setCommitmentTerm(e.target.value)}
            placeholder="e.g. 181 days"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes about rent, payment arrangements, or special conditions..."
          rows={3}
        />
      </div>

      {/* Check-In Restrictions (non-disciplinary) */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Check-In Restrictions</h3>
            <p className="text-sm text-muted-foreground">
              Add intake restrictions for this new resident (non-disciplinary).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setCheckInRestrictions([
                ...checkInRestrictions,
                {
                  restriction_type: "house_commitment",
                  description: "",
                  end_date: "",
                },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Restriction
          </Button>
        </div>

        {checkInRestrictions.map((r, idx) => (
          <div key={idx} className="rounded-md border p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Restriction {idx + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() =>
                  setCheckInRestrictions(checkInRestrictions.filter((_, i) => i !== idx))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={r.restriction_type}
                  onChange={(e) => {
                    const updated = [...checkInRestrictions];
                    updated[idx] = { ...updated[idx], restriction_type: e.target.value };
                    setCheckInRestrictions(updated);
                  }}
                >
                  <option value="house_commitment">House Commitment (No Leave)</option>
                  <option value="no_leave">No Leave</option>
                  <option value="curfew">Curfew</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={r.end_date}
                  onChange={(e) => {
                    const updated = [...checkInRestrictions];
                    updated[idx] = { ...updated[idx], end_date: e.target.value };
                    setCheckInRestrictions(updated);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Textarea
                rows={2}
                placeholder="e.g., Cannot leave the house for 7 days after move-in"
                value={r.description}
                onChange={(e) => {
                  const updated = [...checkInRestrictions];
                  updated[idx] = { ...updated[idx], description: e.target.value };
                  setCheckInRestrictions(updated);
                }}
              />
            </div>
          </div>
        ))}

        {checkInRestrictions.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No check-in restrictions added. Click &quot;Add Restriction&quot; to add one.
          </p>
        )}
      </div>

      {/* Move-In Payment */}
      <div className="border-t pt-4 space-y-3">
        <div>
          <h3 className="font-semibold text-lg">Move-In Payment</h3>
          <p className="text-sm text-muted-foreground">
            Record the payment collected at move-in. Applied to the admin
            fee first, then the first rent cycle.
          </p>
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Sober Living Fee</span>
            <span className="font-medium">
              ${Number.isFinite(parsedRent) ? parsedRent.toFixed(2) : "0.00"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Administrative Fee</span>
            <span className="font-medium">
              ${Number.isFinite(parsedAdminFee) ? parsedAdminFee.toFixed(2) : "0.00"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t pt-1">
            <span className="font-semibold">Expected at move-in</span>
            <span className="font-semibold">
              ${expectedMoveInTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={moveInNoPayment}
            onChange={(e) => setMoveInNoPayment(e.target.checked)}
          />
          <span>No payment collected at move-in</span>
        </label>

        {!moveInNoPayment && (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Amount Collected *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={moveInAmount}
                    onChange={(e) => setMoveInAmount(e.target.value)}
                    placeholder={expectedMoveInTotal.toFixed(2)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={moveInMethod}
                  onChange={(e) =>
                    setMoveInMethod(
                      e.target.value as typeof moveInMethod
                    )
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="money_order">Money Order</option>
                  <option value="venmo">Venmo</option>
                  <option value="zelle">Zelle</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  value={moveInPaidAt}
                  onChange={(e) => setMoveInPaidAt(e.target.value)}
                />
              </div>
            </div>

            {isPartialPayment && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This is a partial move-in payment (${collectedAmount.toFixed(2)} of ${expectedMoveInTotal.toFixed(2)}). A note is required.
              </div>
            )}

            <div className="space-y-2">
              <Label>
                Note{" "}
                {isPartialPayment ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground">(optional)</span>
                )}
              </Label>
              <Textarea
                value={moveInNote}
                onChange={(e) => setMoveInNote(e.target.value)}
                placeholder={
                  isPartialPayment
                    ? "Explain the partial payment arrangement (remaining balance, due date, etc.)"
                    : "Add context for this payment if helpful"
                }
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* Staff Signature */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-2">Staff Signature</h3>
        <p className="text-sm text-muted-foreground mb-3">
          By signing below, you confirm you have reviewed this resident&apos;s application
          and approve the housing assignment and rent configuration above.
        </p>
        <SignaturePad
          onSignatureChange={setStaffSignature}
          label="Admin/Manager Signature"
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={isPending || !staffSignature}
          size="lg"
        >
          {isPending ? "Completing Review..." : "Complete Intake Review & Sign Commitment"}
        </Button>
      </div>
    </div>
  );
}
