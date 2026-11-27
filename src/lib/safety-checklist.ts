/**
 * Self — Safety Assessment checklist schema.
 *
 * Derived from the paper form used by A Endless Summer House. Each
 * section's `key` is stored at the top level of the saved checklist
 * JSON, and each item's `key` is the second-level key. Answers are
 * booleans — a missing key is treated as unchecked.
 *
 * Policy preamble from the paper form:
 *
 *   "It is the policy of A Endless Summer House to conduct regular
 *   self-safety assessments monthly. A log of these assessments is
 *   maintained at each property location."
 *
 * Keep keys stable even as wording changes — past assessments are
 * stored by (section_key, item_key), and we want historical rows to
 * continue rendering correctly.
 */
export interface SafetyChecklistItem {
  key: string;
  label: string;
}

export interface SafetyChecklistSection {
  key: string;
  title: string;
  items: SafetyChecklistItem[];
}

export const SAFETY_CHECKLIST: SafetyChecklistSection[] = [
  {
    key: "smoke_fire",
    title: "Smoke Detectors / Fire Extinguishers",
    items: [
      {
        key: "alarm_per_level_and_sleeping",
        label:
          "There is one smoke alarm on every level of the home and inside and outside each sleeping area.",
      },
      {
        key: "alarms_tested_cleaned_monthly",
        label: "Smoke alarms are tested and cleaned monthly.",
      },
      {
        key: "alarm_batteries_changed",
        label: "Smoke alarm batteries are changed as needed.",
      },
      {
        key: "alarms_under_10_years",
        label: "Smoke alarms are less than 10 years old.",
      },
      {
        key: "extinguishers_mounted",
        label:
          "Functioning fire extinguishers are mounted in plain sight and in clear locations.",
      },
    ],
  },
  {
    key: "cooking",
    title: "Cooking Safety",
    items: [
      {
        key: "cooking_area_free_of_fire_items",
        label: "Cooking area is free from items that can catch fire.",
      },
      {
        key: "stove_hood_clean_vented",
        label: "Kitchen stove hood is clean and vented to the outside.",
      },
      {
        key: "pots_not_unattended",
        label: "Pots are not left unattended on the stove.",
      },
      {
        key: "kitchen_appliances_clean",
        label:
          "Kitchen, fridge, microwave, oven are clean of bacteria and mold.",
      },
    ],
  },
  {
    key: "electrical",
    title: "Electrical & Appliance Safety",
    items: [
      {
        key: "cords_not_under_rugs",
        label: "Electrical cords do not run under rugs.",
      },
      {
        key: "cords_not_frayed",
        label: "Electrical cords are not frayed or cracked.",
      },
      {
        key: "multi_prong_adapters_circuit_protected",
        label:
          "Circuit-protected, multi-prong adapters are used for additional outlets.",
      },
      {
        key: "large_appliances_direct_wall",
        label:
          "Large and small appliances are plugged directly into wall outlets.",
      },
      {
        key: "dryer_lint_clean",
        label: "Clothes dryer lint filter and venting system are clean.",
      },
      {
        key: "appliances_working_good_condition",
        label: "Appliances are in working order and in good condition.",
      },
    ],
  },
  {
    key: "resident_farr",
    title: "Resident Safety / FARR Compliance",
    items: [
      {
        key: "resident_rights_posted",
        label: "Resident Rights & Requirements posted.",
      },
      {
        key: "grievance_policy_posted",
        label: "Grievance Policy & Procedure posted.",
      },
      {
        key: "emergency_phone_posted",
        label: "Emergency phone numbers are posted.",
      },
      {
        key: "emergency_procedures_trained",
        label:
          "Emergency procedures are posted and staff / residents are trained on procedures.",
      },
      {
        key: "narcan_available_trained",
        label:
          "Narcan is readily available and staff and residents are trained in its use.",
      },
      {
        key: "smoke_free_environment",
        label: "Residence is a smoke-free living environment.",
      },
      {
        key: "designated_smoking_areas",
        label:
          "Designated smoking areas are located outside the residence (typically out back so as to not draw neighbors' attention to the home).",
      },
      {
        key: "cigarette_butts_in_ashtrays",
        label:
          "Cigarette butts are discarded in ashtrays and not tossed on the ground.",
      },
      {
        key: "ashtrays_safe",
        label:
          "Ashtrays are large, deep, and kept away from items that can catch fire.",
      },
      {
        key: "ashtrays_emptied_fireproof",
        label: "Ashtrays are emptied regularly into a fire-proof container.",
      },
    ],
  },
  {
    key: "heating",
    title: "Heating Safety",
    items: [
      {
        key: "chimney_furnace_cleaned",
        label: "Chimney and furnace are cleaned and inspected yearly.",
      },
      {
        key: "furniture_3ft_from_heat",
        label:
          "Furniture and other items that can catch fire are at least 3 feet from fireplaces, wall heaters, baseboards, and space heaters.",
      },
      {
        key: "fireplace_ashes_metal_container",
        label:
          "Fireplace and barbecue ashes are placed outdoors in a covered metal container at least 3 feet from anything that can catch fire.",
      },
      {
        key: "no_extension_cords_heaters",
        label: "Extension cords are never used with space heaters.",
      },
      {
        key: "heaters_approved_tipover",
        label:
          "Heaters are approved by a national testing laboratory and have tip-over shut-off function.",
      },
    ],
  },
  {
    key: "escape_plan",
    title: "Home Escape Plan",
    items: [
      {
        key: "two_ways_out",
        label: "Have two ways out of each sleeping room.",
      },
      {
        key: "meeting_location_known",
        label:
          "Know where to meet after the escape. (Designated meeting location)",
      },
      {
        key: "meeting_place_near_front",
        label:
          "Meeting place should be near the front of the home so firefighters know you are out.",
      },
      {
        key: "practice_fire_escape",
        label: "Practice your fire escape plan.",
      },
      {
        key: "evacuation_maps_posted",
        label: "Evacuation maps are posted in conspicuous locations.",
      },
    ],
  },
  {
    key: "gas_appliances",
    title: "When Gas Appliances Are Present",
    items: [
      {
        key: "co_alarms_each_level",
        label: "Carbon monoxide alarms are located on each level of the home.",
      },
      {
        key: "co_alarms_under_7_years",
        label: "Carbon monoxide alarms are less than 7 years old.",
      },
    ],
  },
];

/**
 * Serialized form stored in `safety_assessments.checklist`:
 * `{ [sectionKey]: { [itemKey]: true | false } }`.
 */
export type SafetyChecklistResponses = Record<string, Record<string, boolean>>;

export function countCheckedItems(
  responses: SafetyChecklistResponses
): { checked: number; total: number } {
  let checked = 0;
  let total = 0;
  for (const section of SAFETY_CHECKLIST) {
    for (const item of section.items) {
      total += 1;
      if (responses[section.key]?.[item.key] === true) checked += 1;
    }
  }
  return { checked, total };
}
