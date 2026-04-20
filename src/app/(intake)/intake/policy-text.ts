// Verbatim text content for every policy & acknowledgment page on the paper
// JSL Resident Application. Used by both the intake wizard and the generated
// PDF so a resident sees the exact same language in the UI and on the file
// they sign.

export interface PolicySection {
  heading?: string;
  body: string;
}

export interface PolicyPageContent {
  title: string;
  sections: PolicySection[];
  signatureKey: string;
  witnessKey?: string; // some pages ask for a Witness (or Staff) signature
  witnessLabel?: string; // "Witness Signature" | "Staff Signature"
}

export const MAT_POLICY: PolicyPageContent = {
  title: "MAT Medication Storage & Use",
  signatureKey: "mat_policy",
  witnessKey: "mat_policy_witness",
  witnessLabel: "Witness Signature",
  sections: [
    {
      heading: "Policy",
      body:
        "A Endless Summer House recognizes federally approved MAT programs as a viable treatment option for residents who suffer from opioid addiction. A Endless Summer House will make reasonable accommodations to allow residents to engage in an MAT program. FARR supports programming of federally approved Medical Assisted Recovery, such as, Medication Assisted Treatment.",
    },
    {
      heading: "Procedure",
      body:
        "All potential MAT residents will be screened prior to entry to ensure they fit the criteria for admission.\n\nResidents enrolled in a MAT program with a licensed physician will be treated the same and have the same privileges as non-MAT residents. The only differences will be listed in this policy to ensure medication is secure and taken properly.\n\nResidents will be required to turn in all MAT medications to staff upon admission to \u201CA Endless Summer House\u201D and immediately after refilling prescription.\n\nAll MAT medications will be kept locked in the manager\u2019s office. (See P & P for more information on these)\n\nA Endless Summer House will not dispense medications. Residents will be given daily access to medications.\n\nA Endless Summer House will house MAT residents with non-MAT residents.\n\nMAT residents may not exhibit noticeable physical signs of being on MAT medications.\n\nAny residents caught stockpiling MAT medications or abusing the medication in any way will be considered a relapse and would be disciplined under the recurrence of use policy and procedure.",
    },
  ],
};

export const GOOD_NEIGHBOR_POLICY: PolicyPageContent = {
  title: "Good Neighbor Policy and Procedure",
  signatureKey: "good_neighbor_policy",
  witnessKey: "good_neighbor_policy_witness",
  witnessLabel: "Witness Signature",
  sections: [
    {
      heading: "Policy",
      body:
        "Jax Sober Living will conduct the residence in an appropriate manner respecting the neighbors and the neighborhood we operate in.\n\nConcerns neighbors have can be addressed to:\n\u2022 Owner\n\u2022 Director of Operations\n\u2022 Manager\n\u2022 CRRA",
    },
    {
      heading: "Procedure",
      body:
        "All residents, staff, employees, and visitors will be instructed to communicate neighbor concerns to the CRRA so they can be addressed. Neighbors can address their concerns with the CRRA personally or by phone. The CRRA name and phone number will be posted inside each residence. Each staff member and resident manager will be trained on this policy by the CRRA or designee. Residents are educated on this policy on admission in review of the residence guidelines. This policy is responsive and preemptive to neighbor\u2019s reasonable complaints regarding smoking, loitering, parking, noise, lewd or offensive language, cleanliness of public space around the property and parking courtesy rules where street parking is scarce. The recovery resident within the residence guidelines outlines expectations that enable it to ensure these good neighbor practices are accomplished.\n\n1. Residents will smoke in the rear of its properties. All cigarette butts are to be placed in a fireproof receptacle.\n\n2. Residents will not make excessive noise.\n\n3. Residents will not loiter around the front of the property.\n\n4. Residents will keep the exterior of the home in good condition. Residents will not leave broken down vehicles, trash, or bulk material piled up in view of the property from the street. Residents will ensure the exterior of the home resembles a traditional family household.\n\n5. Residents will park in front of Jax Sober Living\u2019s residences and not the neighbor\u2019s residences.\n\n6. Residents are expected to act as good neighbors and greet neighbors in a friendly manner.\n\n7. Residents will direct all neighbor grievances or complaints directly to the CRRA or Owner. Phone numbers for the Owner and CRRA will be placed in the front window of the manager\u2019s office. Residents are not to handle complaints from neighbors on their own.",
    },
  ],
};

export const CONFIDENTIALITY_POLICY: PolicyPageContent = {
  title: "Confidentiality Policy and Procedure",
  signatureKey: "confidentiality_policy",
  witnessKey: "confidentiality_policy_witness",
  witnessLabel: "Witness Signature",
  sections: [
    {
      heading: "Confidentiality Statement",
      body:
        "Jax Sober Living will comply with all applicable laws and regulations regarding your confidential information. In the Jax Sober Living \u201CIntake paperwork\u201D you have signed the necessary releases, and we will abide by those documented intentions.",
    },
    {
      heading: "Confidentiality Policy",
      body:
        "Only pertinent information will be collected, and that information will be kept securely. Only house managers and CRRAs will collect and have access to this information and in turn will be responsible for protecting it while it is in our care. The information will be locked in the CRRA\u2019s office. All resident information will be kept for one year after the resident leaves Jax Sober Living. After that point, the information will be destroyed completely by shredding or deletion from the electronic file.\n\nJax Sober Living will orientate residents to Jax Sober Living use of release of information (ROI) and obtain consent before releasing any resident information. Residents will also be informed when the resident\u2019s confidentiality can be broken.\n\nResidents are asked to respect peer to peer anonymity during and after their stay with us at Jax Sober Living. Any current residents that are found to break peer anonymity purposely or incidentally are subject to dismissal from the Jax Sober Living community.",
    },
    {
      heading: "We can break this confidentiality under the following circumstances:",
      body:
        "\u2022 To comply with a court order or court-ordered warrant, a subpoena or summons issued by a judicial officer, or a grand jury subpoena.\n\u2022 For purposes of identifying or locating a suspect, fugitive, material witness or missing person.\n\u2022 To respond to an information request about a victim of a crime, and the victim agrees.\n\u2022 To report child abuse or neglect.\n\u2022 To report adult abuse, neglect, or domestic violence.\n\u2022 To report to law enforcement when required by law, such as gunshot or stab wounds.\n\u2022 To report the death of an individual.\n\u2022 To report what the covered entity believes in good faith to be evidence of a crime.\n\u2022 To report criminal activity, when responding to an off-site medical emergency.\n\u2022 For certain other specialized governmental law enforcement purposes.\n\u2022 For a medical emergency.",
    },
  ],
};

export const DISCHARGE_POLICY: PolicyPageContent = {
  title: "Discharge Policy and Procedure",
  signatureKey: "discharge_policy",
  witnessKey: "discharge_policy_witness",
  witnessLabel: "Witness Signature",
  sections: [
    {
      heading: "Policy",
      body:
        "To document and communicate the resident\u2019s readiness for discharge. If the criteria apply to the existing or new problem(s), the resident should be discharged.",
    },
    {
      heading: "Procedure",
      body:
        "It is appropriate to discharge the resident from the present level of care at Jax Sober Living if the resident meets the following criteria:\n\n\u2022 If a continuing care program can be arranged and deployed at an alternate level of care.\n\u2022 The resident no longer meets admission criteria.\n\u2022 Consent for care is withdrawn and it is determined that the resident has the capacity to make an informed decision and does not meet criteria for Jax Sober Living level of care.\n\u2022 The resident is not making progress toward Jax Sober Living goals and there is no reasonable expectation of progress at this level of care.\n\u2022 Finally, the resident fails a UA/BA which determines they need a higher level of care.\n\nAny resident expelled for any reason other than a successful discharge will not be permitted to return to the premises, and must go to a relative, stabilization respite, mission, shelter, hospital, or detox. All discharged residents will receive community resources upon exit.\n\nResident\u2019s emergency contact will be notified of discharge for any type of discharge.",
    },
    {
      heading: "Procedure for resident to pick up belongings (Abandonment, ASA, etc.)",
      body:
        "Upon expulsion, personal belongings must be picked up within ten days or the belongings will become the property of Jax Sober Living and may be donated to a local charity. Residents or their representatives must stay in contact with Jax Sober Living staff during this time or risk having their property donated to charity. Any refund of fees paid in advance will be forfeited in the event of the resident leaving the property without prior proper notification.",
    },
    {
      heading: "Procedure for resident administratively discharged",
      body:
        "Any residents administratively discharged from Jax Sober Living will have 1 hour to vacate the property. Residents will be accompanied by a Jax Sober Living staff member during this time. Residents will be made aware that if they re-enter Jax Sober Living property without permission then they will be deemed trespassers, and the proper authorities will be contacted.",
    },
    {
      heading: "Procedure for resident successfully discharged",
      body:
        "A resident has successfully discharged from the program once they have achieved their recovery goals and have become stable enough in their recovery to be able to support themselves without sober living. Length of stay is determined by the resident and not the provider. Please inform Jax Sober Living one week prior to you moving out. Upon leaving the resident\u2019s bedroom should be thoroughly cleaned and left ready for the next resident to move in.",
    },
  ],
};

export const HAZARDOUS_ITEMS_POLICY: PolicyPageContent = {
  title: "Hazardous Items and Search Policy and Procedures",
  signatureKey: "hazardous_items_policy",
  witnessKey: "hazardous_items_policy_witness",
  witnessLabel: "Staff Signature",
  sections: [
    {
      heading: "Policy",
      body:
        "Jax Sober Living will conduct hazardous item searches (health and welfare searches) periodically to ensure compliance with house guidelines and community safety. Jax Sober Living will also inspect all incoming resident\u2019s person and belongings with the resident\u2019s consent (including resident\u2019s vehicles) for any contraband we deem inappropriate for the Jax Sober Living community. If a resident fails to give consent to search said resident\u2019s property, then they will either not be admitted into the Jax Sober Living community or discharged from Jax Sober Living housing. Residents do not have to be present during the search of their property. A resident\u2019s vehicle is also subject to search if suspicion is warranted.",
    },
    {
      heading: "Procedure",
      body:
        "Jax Sober Living will search its housing and resident belongings for items not approved for the Jax Sober Living residence.",
    },
    {
      heading: "Items not approved include but are not limited to:",
      body:
        "\u2022 Drugs\n\u2022 Mind or mood-altering substances\n\u2022 Alcohol\n\u2022 CBD products\n\u2022 Kratom / Kava\n\u2022 Fireworks\n\u2022 Steroids\n\u2022 ZaZa\n\u2022 OTC medications containing alcohol including mouthwash\n\u2022 Food items with high alcohol content (cooking wines, vanilla extract, etc.)\n\u2022 Cough Medicine\n\u2022 Any medication containing DXM\n\u2022 Drug Paraphernalia\n\u2022 Weapons (Knives with blades under 4 inches in length are approved)\n\u2022 Clothes or materials depicting gang affiliation, drug use, or the glorification of drug use\n\u2022 Poppers\n\u2022 Prescription medications not approved by Jax Sober Living\n\u2022 Prescription medications not properly stored in managers office when needed\n\u2022 Prescription medications that are not labeled with the resident\u2019s name\n\u2022 Anything Jax Sober Living deems to be inappropriate",
    },
    {
      heading: "Resident\u2019s property will be searched under the following conditions:",
      body:
        "1. Randomly\n2. Upon admission to Jax Sober Living\n3. Suspicion of relapse\n4. Information stating that the resident may be engaging in illegal, suspicious, or dangerous activity.\n\nResidents will be made aware of prohibited items on admission to Jax Sober Living. At this time, residents will have the opportunity to disclose prohibited items to Jax Sober Living staff. Drugs and alcohol will be destroyed, all other items must be either thrown away or stored off property during the resident\u2019s stay. Jax Sober Living will not hold prohibited items for a resident during their stay with us. If a resident is found to have a prohibited item on the property while a member of Jax Sober Living, they will risk reprimand or possible expulsion from the Jax Sober Living community.",
    },
  ],
};

export const MEDICATION_STORAGE_POLICY: PolicyPageContent = {
  title: "Medication Storage and Use Policy and Procedure",
  signatureKey: "medication_storage_policy",
  witnessKey: "medication_storage_policy_witness",
  witnessLabel: "Witness Signature",
  sections: [
    {
      heading: "Policy",
      body:
        "Here at Jax Sober Living residents\u2019 mental and physical health are important to us. We encourage residents to seek assistance from doctors if they require their services. Resident\u2019s mental and physical health is equally important to the safety and protection of the entire community. Before choosing to be a part of Jax Sober Living many of our residents spent a lot of time drug seeking through doctors. It is incredibly important for the wellbeing of our community that such behavior will be discouraged here at Jax Sober Living. If a resident needs to see a psychiatrist due to mental health concerns or needs to see a doctor for physical health concerns, Jax Sober Living will assist them when possible.\n\nJax Sober Living will enact practices that will enable safe handling of medications by their residents. The goal of this policy is to diminish the chance of abuse and misuse of medications in the Jax Sober Living community.",
    },
    {
      heading: "Procedure",
      body:
        "If a resident must go to the hospital or see a doctor, please inform Jax Sober Living staff. In the case of an emergency please contact 911 first and then reach out to Jax Sober Living, when possible, to inform us of the situation.\n\nThe resident must bring back all discharge paperwork and hand it to a member of Jax Sober Living staff. A copy will be placed in the resident\u2019s file.\n\nWhen a resident receives a new prescription from a doctor, they must inform Jax Sober Living\u2019s staff immediately. A medication cannot be taken by a resident until it has first been approved by Jax Sober Living.\n\nResidents must inform staff of any changes in their prescriptions. Changes will be noted in the resident\u2019s file.\n\nMedications must be taken as prescribed and in line with the policies and procedures of Jax Sober Living.\n\nMedications (OTC and prescribed) must be stored in their original bottles, labeled, and kept out of sight with your personal belongings. Medications cannot be stored in common areas.\n\nUnder no circumstance should medications be shared between residents regardless of if they are both prescribed the same medication.\n\nResidents that have been found to be selling medications will be immediately discharged and if warranted the proper authorities will be notified.\n\nPlease do not discontinue medications without a doctor\u2019s order.\n\nPlease properly dispose of any unwanted medications.\n\nIf a resident discharges/transfers/or abandons property, Jax Sober Living will hold the resident\u2019s medications in the manager\u2019s office for 10 days. If Jax Sober Living cannot reach the resident or their representative, then Jax Sober Living will properly dispose of the resident\u2019s medications in accordance with DEA guidelines.",
    },
    {
      heading: "PROHIBITED Medications",
      body:
        "Adderall (amphetamines) or medications similar to it (vyvanse, ritalin, dexedrine, etc.), Medical Marijuana, MAT medications not defined in the MAT Storage section, Xanax (benzodiazepines) or medications similar to it (klonopin, valium, ativan, etc.), opiates (broad spectrum), OTC medications containing DXM, diet pills, any medications classified by the FDA as a narcotic, etc. This is not the complete and comprehensive list so please speak to Jax Sober Living staff member prior to ingesting any medications.\n\nMedication counts will be conducted randomly and upon suspicion of medication abuse. If discrepancies are found the resident will be staffed by Jax Sober Living to find out why the medication count is incorrect. If it is found that medication is abused in any manner, Jax Sober Living will consider this a relapse and the resident will be discharged.\n\nIf a resident takes a mind-altering substance, and it was deemed not to be a medical necessity, meaning severe bodily injury, that resident will be discharged from our residence. Jax Sober Living staff will make the determination of what is considered \u201Csevere bodily injury\u201D, due to the importance of maintaining our abstinence free environment. If as a resident you feel you really need something, but the staff disagrees, please do what you feel is right for you, but you will no longer be allowed to continue residing with Jax Sober Living.",
    },
  ],
};

export const DOCUMENT_RECEIPT_TEXT = `I, ____________________, have received my copies of the Jax Sober Living Halfway House Resident Packet. It is my responsibility to read and understand the matters set forth in this packet. It is a guide to firm policies and procedures. I understand that no statement contained in these forms creates any guarantee of continued residency or creates any obligation, contractual or otherwise, on the part of the Jax Sober Living Halfway House. I will rely on any promises, statements or representations to the contrary only if they are in writing and signed by an authorized member of Jax Sober Living Halfway House management. I understand and acknowledge that Jax Sober Living Halfway House has the right, without prior notice, to modify, amend or terminate policies, practices, and other institutional programs within the limits and requirements imposed by law.`;

export const ROI_INTRO_TEXT = `Jax Sober Living requires all incoming residents to list a family member, friend or associate as an emergency contact in their ROI prior to admission into Jax Sober Living. This person will be contacted in the event of a relapse, medical emergency, injury, death, or discharge. Potential residents are required to list someone as an emergency contact as part of the admission criteria. ROI is also required for any persons other than the resident paying program fees.

Jax Sober Living strongly encourages all residents that are receiving treatment or aftercare from an outside service provider to sign this written authorization form allowing us to communicate bilaterally (back and forth) with the facility and its staff to better serve you during our stay with us.

Jax Sober Living strongly encourages all residents to add key members of their support network such as family or 12-step sponsors to this written authorization form. Sponsors are contacted periodically to confirm residents are working a 12-step program. We will not ask for updates on the residents\u2019 recovery, we will only ask for confirmation of sponsorship.

I authorize Jax Sober Living to exchange information about my condition and/or presence at Jax Sober Living with the following individuals. I understand I may revoke this consent in writing at any time unless I have left Jax Sober Living without prior notice, relapsed, or committed a crime.

If not previously revoked this consent will expire one year from the date of signing.`;

export const APPLICATION_ATTEST_TEXT = `By signing this document, I attest that all the above information is true and accurate to the best of my knowledge.

*NOTE: Residents are to add \u201CJax Sober Living\u201D phone number to their phone contact list. \u201CJax Sober Living\u201D staff are to add the new resident\u2019s cell number as well.`;

export const ALL_POLICIES: PolicyPageContent[] = [
  MAT_POLICY,
  GOOD_NEIGHBOR_POLICY,
  CONFIDENTIALITY_POLICY,
  DISCHARGE_POLICY,
  HAZARDOUS_ITEMS_POLICY,
  MEDICATION_STORAGE_POLICY,
];
