import { describe, expect, it } from "vitest";
import {
  notificationTypesForCategory,
  allMappedNotificationTypes,
  NEEDS_ATTENTION_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_TO_CATEGORY,
} from "../app/(dashboard)/notifications/categories";
import {
  chargeTypeLabel,
  formatMoney,
  ordinal,
  paymentLabel,
} from "../app/(dashboard)/residents/[id]/_payments/helpers";

describe("notification categories", () => {
  it("every needs-attention type has a category mapping", () => {
    for (const t of NEEDS_ATTENTION_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_TO_CATEGORY[t], t).toBeDefined();
    }
  });

  it("category filter returns its types; All/Other return nothing", () => {
    expect(notificationTypesForCategory("All")).toEqual([]);
    expect(notificationTypesForCategory("Other")).toEqual([]);
    expect(notificationTypesForCategory("Needs Attention")).toEqual([
      ...NEEDS_ATTENTION_NOTIFICATION_TYPES,
    ]);
    const leave = notificationTypesForCategory("Leave");
    expect(leave).toContain("cover_request");
    expect(leave).toContain("leave_approved");
    expect(leave).not.toContain("demerit_issued");
  });

  it("allMapped covers the record", () => {
    expect(allMappedNotificationTypes().length).toBe(
      Object.keys(NOTIFICATION_TYPE_TO_CATEGORY).length
    );
  });
});

describe("payment display helpers", () => {
  it("formatMoney renders dollars with cents", () => {
    expect(formatMoney(1000)).toBe("$1,000.00");
    expect(formatMoney(99.5)).toBe("$99.50");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("chargeTypeLabel maps known types and humanizes the rest", () => {
    expect(chargeTypeLabel("rent")).toBe("Rent");
    expect(chargeTypeLabel("admin_fee")).toBe("Admin Fee");
    expect(chargeTypeLabel("late_fee")).toBe("late fee");
  });

  it("paymentLabel joins type and method", () => {
    expect(paymentLabel("rent", "cash")).toBe("Rent · cash");
    expect(paymentLabel("rent", null)).toBe("Rent");
    expect(paymentLabel(null, null)).toBe("Payment");
  });

  it("ordinal suffixes", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
    expect(ordinal(28)).toBe("28th");
  });
});
