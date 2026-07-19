export interface RulesSlide {
  title: string;
  titleColor?: "green" | "blue" | "yellow";
  items?: { num?: number; text: string }[];
  bullets?: string[];
  warning?: string;
  note?: string;
}

export const RULES_SLIDES: RulesSlide[] = [
  // Slide 0: Title
  {
    title: "House Rules & Consequences",
    note: "JSL Sober Living Residences — Please read each section carefully. You will be asked to sign an acknowledgment at the end.",
  },

  // Slide 1: Zero Tolerance
  {
    title: "Zero Tolerance Rules",
    items: [
      {
        num: 1,
        text: '<strong>Zero Tolerance</strong> for drug or alcohol use and/or possession. No engaging in illegal/illicit or prohibited substance manufacturing, possession and/or distribution. Violation may result in immediate discharge. No refunds. Includes spice/marijuana vapor juice, kava, kratom, DXM, poppers, steroids, CBD products, etc.',
      },
      {
        num: 2,
        text: '<strong>Zero Tolerance</strong> for stealing (charges may be filed). Taking food from others without permission is considered stealing. Tampering with locks and keys prohibited.',
      },
      {
        num: 3,
        text: '<strong>Zero Tolerance</strong> for destruction or vandalizing (<em>charges may be filed</em>) of JSL Sober Living Residences or other residents\' property.',
      },
      {
        num: 4,
        text: '<strong>Zero Tolerance</strong> for sexually harassing or engaging in sexual behavior or language with any staff or resident.',
      },
      {
        num: 5,
        text: '<strong>Zero Tolerance</strong> for physical confrontation or altercation with any staff or resident. No physical or verbal threats. No weapons allowed on property or in residents\' vehicles.',
      },
    ],
  },

  // Slide 2: General Rules 1-5
  {
    title: "General Rules (1–5)",
    titleColor: "yellow",
    items: [
      {
        num: 1,
        text: 'All medications must be taken as prescribed. No medications are to be taken by the residents unless approved by the Director of Operations. Under no circumstances are your medications to be borrowed, lent, sold or given away. <strong>Certain prescribed medications are prohibited regardless of physician\'s orders (i.e. Ritalin, Benzodiazepines, etc.)</strong>',
      },
      {
        num: 2,
        text: 'As a member of a recovering community, we request any resident who knows that another resident has violated any rules report the behavior to staff. If they do not, they will also be held accountable.',
      },
      {
        num: 3,
        text: 'Any visitor to JSL Sober Living Residences property will be asked to leave immediately if staff or residents suspect any use of illegal or illicit drugs, including alcohol. Residents who breach rules will not be permitted back without a staff member.',
      },
      {
        num: 4,
        text: 'Family members and/or visitors must be off property between the hours of 6 PM–7 AM, unless they drop the resident off.',
      },
      {
        num: 5,
        text: 'All residents must attend daily 12-step meetings while residing at JSL Sober Living Residences.',
      },
    ],
  },

  // Slide 3: General Rules 6-10
  {
    title: "General Rules (6–10)",
    titleColor: "yellow",
    items: [
      {
        num: 6,
        text: 'Residents must obtain and maintain a sponsor <strong>within the first 30 days</strong> of admission to the residence and be working the 12 steps.',
      },
      {
        num: 7,
        text: 'Residents must attend a mandatory weekly house meeting. Times will be indicated by the house manager.',
      },
      {
        num: 8,
        text: 'Residents understand that JSL Sober Living Residences staff, management, and owners are not held responsible for any loss, damage or theft of property. JSL will not be held responsible for any personal accidents or injuries in the home.',
      },
      {
        num: 9,
        text: 'Residents must be willing to submit to a drug/alcohol urine screen at the request of the Director. If a resident tests positive, they will be discharged. Failure to submit will be treated as positive and result in discharge.',
      },
      {
        num: 10,
        text: 'Residents are not permitted to eat any food containing poppy seeds. JSL does not utilize lab confirmation testing for suspected false positive results.',
      },
    ],
  },

  // Slide 4: General Rules 11-16
  {
    title: "General Rules (11–16)",
    titleColor: "yellow",
    items: [
      {
        num: 11,
        text: 'Tattooing, piercing, or anything similar by residents on other residents on property is prohibited. Residents are not to engage in financial contracts with other residents without first speaking to staff.',
      },
      {
        num: 12,
        text: 'Residents\' rooms must be kept clean, beds made anytime the bed is unoccupied. Chores are to be completed. <strong>Curfew is strictly enforced:</strong> Mon–Thu (11pm), Fri–Sun (12am).',
      },
      {
        num: 13,
        text: 'Residents must sleep at the house each night. Overnight passes available after 30 days, restricted to max 2 nights per request. Rent must be current. Approval is at the discretion of JSL staff.',
      },
      {
        num: 14,
        text: 'Residents are not permitted to have any members of the opposite sex inside the property.',
      },
      {
        num: 15,
        text: 'Residents are to not engage in any sexual activities with other residents on JSL property.',
      },
      {
        num: 16,
        text: 'Residents are not permitted to have overnight guests.',
      },
    ],
  },

  // Slide 5: General Rules 17-22
  {
    title: "General Rules (17–22)",
    titleColor: "yellow",
    items: [
      {
        num: 17,
        text: 'There is absolutely no loitering in the front of the property.',
      },
      {
        num: 18,
        text: 'Residents must be employed or enrolled in school within the first 30 days. <strong>Not allowed to go to or work in bars, kava/kratom bars, casinos, night clubs, strip clubs, massage parlors or escort services.</strong>',
      },
      {
        num: 19,
        text: 'Residents not employed, in school or actively volunteering must be off the property by 9 AM daily and return after 2 PM during weekdays, Monday through Friday.',
      },
      {
        num: 20,
        text: 'Residents are responsible for the purchase of their own food and personal hygiene items.',
      },
      {
        num: 21,
        text: 'There is a television available. No pornography or loud music. <strong>Downloading of media files utilizing any file sharing websites is strictly prohibited.</strong>',
      },
      {
        num: 22,
        text: 'If Residents have a car, they must provide a copy of their insurance policy and driver\'s license. Unregistered or uninsured vehicles may be towed at owner\'s expense.',
      },
    ],
  },

  // Slide 6: General Rules 23-26
  {
    title: "General Rules (23–26)",
    titleColor: "yellow",
    items: [
      {
        num: 23,
        text: 'Residents are not allowed to tamper with fire safety equipment, smoke alarms, exit signs, or any other safety features.',
      },
      {
        num: 24,
        text: 'Furniture, beds, TVs and appliances provided by JSL. If there is destruction or vandalizing, the Resident will be financially liable.',
      },
      {
        num: 25,
        text: 'The A/C is not to go below 74 degrees. <strong>If you are caught touching the thermostat you will be responsible for the electric bill for that billing cycle.</strong>',
      },
      {
        num: 26,
        text: 'Residents must respect the anonymity of all residents. Residents and house business are confidential and must not be discussed outside the house. <strong>Violation is grounds for discharge.</strong>',
      },
    ],
  },

  // Slide 7: General Rules 27-30
  {
    title: "General Rules (27–30)",
    titleColor: "yellow",
    items: [
      {
        num: 27,
        text: 'Residents are not allowed to wear clothes that relate to drugs, alcohol, or gang activity. Proper clothing must be worn in all common areas.',
      },
      {
        num: 28,
        text: 'Residents are expected to keep good hygiene standards. This includes showering, brushing teeth, and wearing deodorant.',
      },
      {
        num: 29,
        text: 'Residents are to not sleep in the common areas. Bedrooms are the only areas approved for sleeping.',
      },
      {
        num: 30,
        text: 'Random searches will be conducted. Anything belonging to the resident is subject to be searched, including person and vehicle. You do not need to be present for a staff member to search your belongings.',
      },
    ],
  },

  // Slide 8: Consequences
  {
    title: "Consequences",
    warning: '<strong>If residents fail to abide by these rules, JSL Sober Living Residences can and will take away the residents\' privileges</strong> and terminate their stay at the house as appropriate.<br/><br/><strong>Possible consequences include:</strong> early curfew, house restriction, revocation of overnight passes, extra chores, etc.<br/><br/>JSL Sober Living Residences has the right to make exceptions to these rules under specific circumstances.',
    note: 'This is not a complete list of all possible rules and/or violations. As a resident, use your common sense when it comes to doing or not doing something that may affect yours and others\' continued stay.',
  },

  // Slide 9: What JSL Provides
  {
    title: "What JSL Provides",
    titleColor: "green",
    bullets: [
      "Bed linens (fitted sheet, pillow, pillowcase, and comforter)",
      "Basic cable television",
      "Internet service",
      "Utilities (city water & electricity)",
      "General maintenance of properties (lawn service, AC filters, light bulb replacement, etc.)",
    ],
    note: "It is at the discretion of JSL Sober Living Residences on what items not listed will be provided to residents during their stay.",
  },

  // Slide 10: Resident Responsible For
  {
    title: "What Residents Are Responsible For",
    titleColor: "blue",
    bullets: [
      "Laundry soap / bleach / dryer sheets",
      "Paper towels",
      "Food",
      "Damage to the property caused by the resident",
      "Extra linens",
      "Personal Hygiene Items (Shampoo, Conditioner, Soap, Toothpaste, Toothbrush, etc.)",
      "Personal bath towels",
    ],
  },

  // Slide 11: Resident Responsibilities 1-8
  {
    title: "Resident Responsibilities",
    titleColor: "blue",
    items: [
      { num: 1, text: "Responsible for staying sober and to inform staff when they feel their sobriety is in danger." },
      { num: 2, text: "Responsible for attending all scheduled meetings." },
      { num: 3, text: "Responsible for attending all weekly daily 12-step meetings." },
      { num: 4, text: "Residents are required to have a sponsor and be actively working on the 12 steps." },
      { num: 5, text: "Responsible for paying rent on time." },
      { num: 6, text: "Responsible for keeping the residence in a clean state always." },
      { num: 7, text: "Responsible to follow all rules." },
      { num: 8, text: "Responsible to adhere to curfew." },
    ],
  },

  // Slide 12: Resident Responsibilities 9-15
  {
    title: "Resident Responsibilities (cont.)",
    titleColor: "blue",
    items: [
      { num: 9, text: "Responsible for informing house managers when they suspect or know another resident has relapsed." },
      { num: 10, text: "Responsible for acting as a good roommate to the other residents." },
      { num: 11, text: "Responsible for acting as a good neighbor to the surrounding neighborhood." },
      { num: 12, text: "Responsible for giving recovery and being a member in our residence the best shot each day." },
      { num: 13, text: "Responsible for keeping a safe living area for themselves and their roommates." },
      { num: 14, text: "Responsible for informing the staff if they suspect any negative situations may be going on around the properties." },
      { num: 15, text: "Responsible for following local, state, and federal laws while being a resident." },
    ],
  },

  // Slide 13: Final Warning
  {
    title: "Final Notice",
    warning: '<strong>*Relapse, physical violence or the threat of physical violence, stealing, or any unplugging or touching of the cameras will result in immediate discharge from the property.</strong><br/><br/><strong>This notification will serve as your only warning.</strong>',
    note: "Review the Demerit Policy for Rule Violation Consequences. On the next screen, please sign to acknowledge you have read and understood all house rules.",
  },
];
