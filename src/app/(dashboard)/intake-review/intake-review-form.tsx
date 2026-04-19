"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/signature-pad";
import { completeIntakeReview, getRoomsForHouse } from "./actions";
import { Plus, Trash2 } from "lucide-react";
import { getHouseToday } from "@/lib/timezone";

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
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsLoaded, setRoomsLoaded] = useState(false);

  const [paymentFrequency, setPaymentFrequency] = useState<"weekly" | "monthly">("monthly");
  const [rentAmount, setRentAmount] = useState("800");
  const [adminFee, setAdminFee] = useState("200");
  const [commitmentStartDate, setCommitmentStartDate] = useState(
    getHouseToday()
  );

  // Rent Due Date is derived from frequency + start date so admins
  // can't accidentally enter something inconsistent with the schedule.
  // Monthly → "<ordinal> of each month" based on the start day-of-month.
  // Weekly  → "Every <Weekday>" based on the start weekday.
  // Uses a local-date parser so date-only strings don't drift a day in
  // US Pacific.
  const rentDueDate = (() => {
    if (!commitmentStartDate) return "";
    const [y, m, d] = commitmentStartDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    // Use UTC midnight + UTC weekday lookup so the weekday label
    // matches the stored calendar day regardless of server timezone.
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (paymentFrequency === "weekly") {
      const weekday = dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
      return `Every ${weekday}`;
    }
    const ordinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
    };
    return `${ordinal(d)} of each month`;
  })();
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
    getHouseToday()
  );
  const [moveInNote, setMoveInNote] = useState("");

  // Existing-tenant activation. For residents already living in the
  // house who are caught up on rent — we skip the move-in payment
  // flow entirely and anchor the first rent charge on a future date
  // the admin selects. Default next-rent date is the first of next
  // month, which is what we use most often.
  const [isExistingTenant, setIsExistingTenant] = useState(false);
  const [skipAdminFee, setSkipAdminFee] = useState(true);
  const [nextRentDueDate, setNextRentDueDate] = useState(() => {
    // First of next month, seeded from today-in-app-tz so it doesn't
    // drift around the UTC midnight boundary (8 PM Eastern).
    const [y, m] = getHouseToday().split("-").map(Number);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    return `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01`;
  });

  // Derived move-in totals. The form lets the admin change rent /
  // admin fee interactively so the expected total tracks those.
  // When the admin fee is marked already-paid/waived, it is excluded
  // from the expected move-in total so partial-payment detection
  // reflects only what's actually owed at move-in.
  const parsedRent = parseFloat(rentAmount);
  const parsedAdminFee = parseFloat(adminFee);
  const effectiveAdminFeeForMoveIn = skipAdminFee
    ? 0
    : Number.isFinite(parsedAdminFee)
      ? parsedAdminFee
      : 0;
  const expectedMoveInTotal =
    (Number.isFinite(parsedRent) ? parsedRent : 0) +
    effectiveAdminFeeForMoveIn;
  const parsedMoveInAmount = parseFloat(moveInAmount);
  const collectedAmount = Number.isFinite(parsedMoveInAmount)
    ? parsedMoveInAmount
    : 0;
  const isPartialPayment =
    !isExistingTenant &&
    !moveInNoPayment &&
    collectedAmount > 0 &&
    collectedAmount < expectedMoveInTotal;
  const outstandingAfterMoveIn = Math.max(
    0,
    expectedMoveInTotal - collectedAmount
  );

  async function handleHouseChange(newHouseId: string) {
    setHouseId(newHouseId);
    setRoomId("");
    setBedId("");
    setRooms([]);
    setRoomsError(null);
    setRoomsLoaded(false);

    if (!newHouseId) return;

    setLoadingRooms(true);
    try {
      const result = await getRoomsForHouse(newHouseId);
      if (result.ok) {
        setRooms(result.rooms as Room[]);
        setRoomsLoaded(true);
      } else {
        // Server-side query errored — surface the real message.
        setRoomsError(result.error);
      }
    } catch (err) {
      // Fall-through for unexpected transport-level failures.
      setRoomsError(
        err instanceof Error
          ? err.message
          : "Couldn't load rooms. Try re-selecting the house."
      );
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
    if (isExistingTenant) {
      if (!nextRentDueDate) {
        return setError("Select the next rent due date for this tenant");
      }
      // Sanity check — next rent must be today or later, otherwise the
      // charge opener will backfill it immediately, which defeats the
      // purpose of marking the tenant as caught up.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [ny, nm, nd] = nextRentDueDate.split("-").map(Number);
      const nextDt = new Date(ny, (nm ?? 1) - 1, nd ?? 1);
      if (nextDt.getTime() < today.getTime()) {
        return setError("Next rent due date cannot be in the past");
      }
    } else if (!moveInNoPayment) {
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
        moveInPayment: isExistingTenant ? null : moveInPayload,
        existingTenant: isExistingTenant,
        nextRentDueDate: isExistingTenant ? nextRentDueDate : undefined,
        skipInitialAdminFee: skipAdminFee,
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
          {roomsError && (
            <p className="text-xs text-destructive">{roomsError}</p>
          )}
          {!loadingRooms && roomsLoaded && rooms.length === 0 && !roomsError && (
            <p className="text-xs text-muted-foreground">
              No available beds in this house. Add rooms/beds in the Houses
              tab, or end an existing bed assignment.
            </p>
          )}
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
            readOnly
            disabled
            className="bg-muted/50"
          />
          <p className="text-xs text-muted-foreground">
            Auto-calculated from Payment Frequency + Commitment Start Date.
          </p>
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

        {/* Two explicit top-level checkboxes that staff actually use:
            whether the resident is already paid up on rent (skip the
            initial rent charge, anchor billing to a future date) and
            whether the admin fee has already been collected or
            waived. Each is independently toggleable now so e.g. a new
            resident whose admin fee was waived by the owner can still
            pay rent at move-in. The "existing tenant" language is
            preserved in the help copy for continuity but the checkbox
            is labeled around the concrete action for staff. */}
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm rounded-md border p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={isExistingTenant}
              onChange={(e) => setIsExistingTenant(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                Rent paid up already for this cycle
              </span>
              <span className="block text-xs text-muted-foreground">
                Tick this for residents already living in the house who
                are caught up on rent. No move-in rent charge is opened;
                the next rent cycle starts on the date you pick below.
              </span>
              {isExistingTenant && (
                <span className="mt-3 block space-y-2">
                  <Label className="text-xs">Next Rent Due Date *</Label>
                  <Input
                    type="date"
                    value={nextRentDueDate}
                    onChange={(e) => setNextRentDueDate(e.target.value)}
                    min={getHouseToday()}
                    className="max-w-xs"
                  />
                  <span className="block text-xs text-muted-foreground">
                    Rent cycles continue {paymentFrequency} from this date.
                  </span>
                </span>
              )}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm rounded-md border p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={skipAdminFee}
              onChange={(e) => setSkipAdminFee(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                Admin fee already paid / waived
              </span>
              <span className="block text-xs text-muted-foreground">
                Skip the $
                {Number.isFinite(parsedAdminFee)
                  ? parsedAdminFee.toFixed(0)
                  : "200"}{" "}
                admin fee charge. Use when the resident paid the
                admin fee prior to move-in (cash at the office,
                prior deposit, etc.) or the fee was waived. Applies
                to both new intakes and existing-tenant activations.
              </span>
            </span>
          </label>
        </div>

        {!isExistingTenant && (
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
        )}

        {!isExistingTenant && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={moveInNoPayment}
            onChange={(e) => setMoveInNoPayment(e.target.checked)}
          />
          <span>No payment collected at move-in</span>
        </label>
        )}

        {!isExistingTenant && !moveInNoPayment && (
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
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
                <div>
                  This is a partial move-in payment (${collectedAmount.toFixed(2)} of ${expectedMoveInTotal.toFixed(2)}). A note is required.
                </div>
                <div className="font-medium">
                  Outstanding after move-in: ${outstandingAfterMoveIn.toFixed(2)}{" "}
                  <span className="font-normal">
                    — this will show on the Payments tab.
                  </span>
                </div>
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
