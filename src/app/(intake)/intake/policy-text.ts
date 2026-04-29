// Generic policy and acknowledgment content for the resident application.
// All facility-specific references are replaced with a `facilityName`
// parameter so each workspace sees their own branding. Used by both the
// intake wizard and the generated PDF.

export interface PolicySection {
  heading?: string;
  body: string;
}

export interface PolicyPageContent {
  title: string;
  sections: PolicySection[];
  signatureKey: string;
  witnessKey?: string;
  witnessLabel?: string;
}

export function getHouseRulesPolicy(facilityName: string): PolicyPageContent {
  return {
    title: "House Rules & Expectations",
    signatureKey: "house_rules_policy",
    witnessKey: "house_rules_policy_witness",
    witnessLabel: "Staff Signature",
    sections: [
      {
        heading: "Resident Expectations",
        body: `${facilityName} expects all residents to conduct themselves in a respectful and responsible manner. Residents are expected to:\n\n\u2022 Maintain a clean and orderly living space\n\u2022 Respect fellow residents, staff, and neighbors\n\u2022 Comply with all house rules and policies\n\u2022 Participate in assigned chores and duties\n\u2022 Follow curfew and sign-out procedures\n\u2022 Attend required meetings and check-ins\n\u2022 Keep noise to a reasonable level at all times\n\u2022 Report any maintenance issues promptly\n\u2022 Refrain from bringing prohibited items onto the property`,
      },
      {
        heading: "Guest & Visitor Policy",
        body: `Visitors must be approved by staff before entering the residence. Overnight guests are not permitted unless explicitly authorized by management. Residents are responsible for the behavior of their guests while on property.`,
      },
      {
        heading: "Parking & Common Areas",
        body: `Residents must park only in designated areas. Common areas must be kept clean after use. Smoking is permitted only in designated areas. All cigarette butts must be disposed of properly.`,
      },
    ],
  };
}

export function getGoodNeighborPolicy(facilityName: string): PolicyPageContent {
  return {
    title: "Good Neighbor Policy",
    signatureKey: "good_neighbor_policy",
    witnessKey: "good_neighbor_policy_witness",
    witnessLabel: "Witness Signature",
    sections: [
      {
        heading: "Policy",
        body: `${facilityName} will conduct the residence in an appropriate manner respecting the neighbors and the neighborhood we operate in.\n\nConcerns neighbors have can be addressed to:\n\u2022 Owner\n\u2022 Director of Operations\n\u2022 House Manager`,
      },
      {
        heading: "Procedure",
        body: `Residents are expected to act as good neighbors and greet neighbors in a friendly manner. All neighbor grievances or complaints should be directed to staff — residents should not handle complaints from neighbors on their own.\n\n1. Residents will smoke only in designated areas. All cigarette butts are to be placed in a fireproof receptacle.\n\n2. Residents will not make excessive noise.\n\n3. Residents will not loiter around the front of the property.\n\n4. Residents will keep the exterior of the home in good condition.\n\n5. Residents will park in front of ${facilityName} residences and not the neighbor\u2019s residences.`,
      },
    ],
  };
}

export function getConfidentialityPolicy(facilityName: string): PolicyPageContent {
  return {
    title: "Confidentiality Policy",
    signatureKey: "confidentiality_policy",
    witnessKey: "confidentiality_policy_witness",
    witnessLabel: "Witness Signature",
    sections: [
      {
        heading: "Confidentiality Statement",
        body: `${facilityName} will comply with all applicable laws and regulations regarding your confidential information.`,
      },
      {
        heading: "Policy",
        body: `Only pertinent information will be collected, and that information will be kept securely. Only authorized staff will collect and have access to this information and will be responsible for protecting it. All resident information will be retained per applicable regulations and then properly destroyed.\n\nResidents are asked to respect peer-to-peer anonymity during and after their stay. Any residents found to purposely or incidentally break peer anonymity are subject to dismissal.`,
      },
      {
        heading: "Confidentiality may be broken under the following circumstances:",
        body: `\u2022 To comply with a court order, subpoena, or warrant\n\u2022 To report child abuse, neglect, or elder abuse\n\u2022 To report domestic violence\n\u2022 To respond to a medical emergency\n\u2022 When required by law (e.g. gunshot or stab wounds)\n\u2022 To report what is believed in good faith to be evidence of a crime`,
      },
    ],
  };
}

export function getDischargePolicy(facilityName: string): PolicyPageContent {
  return {
    title: "Discharge Policy",
    signatureKey: "discharge_policy",
    witnessKey: "discharge_policy_witness",
    witnessLabel: "Witness Signature",
    sections: [
      {
        heading: "Policy",
        body: `To document and communicate the resident\u2019s readiness for discharge.`,
      },
      {
        heading: "Procedure",
        body: `It is appropriate to discharge a resident from ${facilityName} if the resident meets the following criteria:\n\n\u2022 A continuing care program can be arranged at an alternate level of care\n\u2022 The resident no longer meets admission criteria\n\u2022 Consent for care is withdrawn\n\u2022 The resident is not making progress toward goals\n\nAny resident expelled for any reason other than a successful discharge will not be permitted to return to the premises. Discharged residents will receive community resources upon exit.\n\nResident\u2019s emergency contact will be notified of discharge.`,
      },
      {
        heading: "Belongings",
        body: `Upon departure, personal belongings must be picked up within ten days or they may be donated to a local charity. Residents or their representatives must stay in contact with ${facilityName} staff during this time.`,
      },
      {
        heading: "Successful Discharge",
        body: `A resident has successfully completed the program once they have achieved their recovery goals and become stable enough to support themselves. Please inform ${facilityName} one week prior to moving out. Upon leaving, the bedroom should be thoroughly cleaned and left ready for the next resident.`,
      },
    ],
  };
}

export function getDocumentReceiptText(facilityName: string): string {
  return `I, ____________________, have received my copies of the ${facilityName} Resident Packet. It is my responsibility to read and understand the matters set forth in this packet. I understand that no statement contained in these forms creates any guarantee of continued residency or creates any obligation, contractual or otherwise, on the part of ${facilityName}. I understand and acknowledge that ${facilityName} has the right, without prior notice, to modify, amend or terminate policies, practices, and other programs within the limits and requirements imposed by law.`;
}

export function getRoiIntroText(facilityName: string): string {
  return `${facilityName} requires all incoming residents to list a family member, friend, or associate as an emergency contact prior to admission. This person will be contacted in the event of an emergency, injury, or discharge.

${facilityName} encourages all residents receiving treatment or aftercare from an outside service provider to sign this written authorization form allowing bilateral communication with the facility and its staff.

I authorize ${facilityName} to exchange information about my condition and/or presence at ${facilityName} with the following individuals. I understand I may revoke this consent in writing at any time.

If not previously revoked, this consent will expire one year from the date of signing.`;
}

export function getApplicationAttestText(): string {
  return `By signing this document, I attest that all the above information is true and accurate to the best of my knowledge.`;
}

export function getAllPolicies(facilityName: string): PolicyPageContent[] {
  return [
    getHouseRulesPolicy(facilityName),
    getGoodNeighborPolicy(facilityName),
    getConfidentialityPolicy(facilityName),
    getDischargePolicy(facilityName),
  ];
}
